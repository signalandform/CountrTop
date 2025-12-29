import { Client, Environment } from 'square';

import { Vendor } from '@countrtop/models';

type RetryConfig = {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableStatusCodes?: number[];
};

type CircuitBreakerState = 'closed' | 'open' | 'half-open';

type CircuitBreakerConfig = {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxCalls?: number;
};

class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenSuccessCount = 0;

  constructor(private config: CircuitBreakerConfig = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeoutMs: config.resetTimeoutMs ?? 60000, // 1 minute
      halfOpenMaxCalls: config.halfOpenMaxCalls ?? 3
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeoutMs!) {
        this.state = 'half-open';
        this.halfOpenSuccessCount = 0;
      } else {
        throw new Error('Circuit breaker is open. Service unavailable.');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.halfOpenSuccessCount++;
      if (this.halfOpenSuccessCount >= this.config.halfOpenMaxCalls!) {
        this.state = 'closed';
        this.halfOpenSuccessCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.halfOpenSuccessCount = 0;
    } else if (this.failureCount >= this.config.failureThreshold!) {
      this.state = 'open';
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }
}

/**
 * Sleep utility for delays
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Checks if an error is retryable based on status code
 */
const isRetryableError = (error: any, retryableStatusCodes: number[]): boolean => {
  const statusCode = error?.statusCode ?? error?.code ?? error?.status;
  if (typeof statusCode === 'number') {
    return retryableStatusCodes.includes(statusCode);
  }
  // Retry on network errors or timeouts
  return error?.message?.includes('timeout') || error?.message?.includes('ECONNRESET');
};

/**
 * Executes a function with exponential backoff retry logic
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    retryableStatusCodes = [429, 500, 502, 503, 504]
  } = config;

  let lastError: any;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if it's the last attempt or error is not retryable
      if (attempt === maxRetries || !isRetryableError(error, retryableStatusCodes)) {
        throw error;
      }

      // Log retry attempt
      console.warn(`[Square API] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms:`, {
        error: error?.message ?? String(error),
        statusCode: error?.statusCode ?? error?.code
      });

      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Creates a Square client with retry logic and circuit breaker
 */
export function createResilientSquareClient(
  vendor: Vendor,
  retryConfig?: RetryConfig,
  circuitBreakerConfig?: CircuitBreakerConfig
) {
  const normalizeCredentialRef = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');

  const resolveAccessToken = (vendor: Vendor) => {
    if (vendor.squareCredentialRef) {
      const refKey = `SQUARE_ACCESS_TOKEN_${normalizeCredentialRef(vendor.squareCredentialRef)}`;
      const refToken = process.env[refKey];
      if (refToken) return refToken;
    }

    return process.env.SQUARE_ACCESS_TOKEN ?? null;
  };

  const resolveEnvironment = (): Environment => {
    const value = (process.env.SQUARE_ENVIRONMENT ?? 'sandbox').toLowerCase();
    return value === 'production' ? Environment.Production : Environment.Sandbox;
  };

  const accessToken = resolveAccessToken(vendor);
  if (!accessToken) {
    throw new Error('Square access token not configured for vendor.');
  }

  const client = new Client({
    accessToken,
    environment: resolveEnvironment()
  });

  const circuitBreaker = new CircuitBreaker(circuitBreakerConfig);

  // Wrap API methods with retry and circuit breaker
  const wrapApiMethod = <T extends (...args: any[]) => Promise<any>>(method: T): T => {
    return (async (...args: any[]) => {
      return circuitBreaker.execute(() => withRetry(() => method(...args), retryConfig));
    }) as T;
  };

  return {
    ...client,
    catalogApi: {
      ...client.catalogApi,
      listCatalog: wrapApiMethod(client.catalogApi.listCatalog.bind(client.catalogApi)),
      retrieveCatalogObject: wrapApiMethod(client.catalogApi.retrieveCatalogObject.bind(client.catalogApi))
    },
    checkoutApi: {
      ...client.checkoutApi,
      createPaymentLink: wrapApiMethod(client.checkoutApi.createPaymentLink.bind(client.checkoutApi))
    },
    ordersApi: {
      ...client.ordersApi,
      retrieveOrder: wrapApiMethod(client.ordersApi.retrieveOrder.bind(client.ordersApi)),
      createOrder: wrapApiMethod(client.ordersApi.createOrder.bind(client.ordersApi))
    },
    // Expose circuit breaker state for monitoring
    getCircuitBreakerState: () => circuitBreaker.getState()
  };
}

/**
 * Default Square client factory (backward compatible)
 * Uses resilient client with default retry and circuit breaker settings
 */
export function squareClientForVendor(vendor: Vendor) {
  return createResilientSquareClient(
    vendor,
    {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      retryableStatusCodes: [429, 500, 502, 503, 504]
    },
    {
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 1 minute
      halfOpenMaxCalls: 3
    }
  );
}

