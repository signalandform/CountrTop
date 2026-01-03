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
const isRetryableError = (error: unknown, retryableStatusCodes: number[]): boolean => {
  // Type guard to check if error is an object with statusCode/code/status properties
  if (error && typeof error === 'object') {
    const err = error as { statusCode?: number; code?: number; status?: number; message?: string };
    const statusCode = err.statusCode ?? err.code ?? err.status;
    if (typeof statusCode === 'number') {
      return retryableStatusCodes.includes(statusCode);
    }
    // Retry on network errors or timeouts
    if (err.message) {
      return err.message.includes('timeout') || err.message.includes('ECONNRESET');
    }
  }
  return false;
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

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      // Don't retry if it's the last attempt or error is not retryable
      if (attempt === maxRetries || !isRetryableError(error, retryableStatusCodes)) {
        throw error;
      }

      // Log retry attempt
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorObj = error && typeof error === 'object' ? error as { statusCode?: number; code?: number } : null;
      const statusCode = errorObj?.statusCode ?? errorObj?.code;
      console.warn(`[Square API] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms:`, {
        error: errorMessage,
        statusCode
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapApiMethod = <T extends (...args: any[]) => Promise<any>>(method: T): T => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      createOrder: wrapApiMethod(client.ordersApi.createOrder.bind(client.ordersApi)),
      searchOrders: wrapApiMethod(client.ordersApi.searchOrders.bind(client.ordersApi))
    },
    locationsApi: {
      ...client.locationsApi,
      retrieveLocation: wrapApiMethod(client.locationsApi.retrieveLocation.bind(client.locationsApi)),
      listLocations: wrapApiMethod(client.locationsApi.listLocations.bind(client.locationsApi))
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

/**
 * Square location data structure returned from API
 */
export type SquareLocationData = {
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  timezone?: string;
};

/**
 * Fetches Square location details by location ID
 * @param vendor - Vendor object with Square credentials
 * @param locationId - Square location ID to fetch
 * @returns Location data including name, address, phone, and timezone
 */
export async function getSquareLocation(
  vendor: Vendor,
  locationId: string
): Promise<SquareLocationData> {
  const square = squareClientForVendor(vendor);
  
  try {
    const { result } = await square.locationsApi.retrieveLocation(locationId);
    
    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map(e => e.detail || e.code).join(', ');
      throw new Error(`Square API error: ${errorMessages}`);
    }
    
    const location = result.location;
    if (!location) {
      throw new Error(`Location ${locationId} not found`);
    }
    
    const address = location.address;
    
    return {
      name: location.name || undefined,
      addressLine1: address?.addressLine1 || undefined,
      addressLine2: address?.addressLine2 || undefined,
      city: address?.locality || undefined,
      state: address?.administrativeDistrictLevel1 || undefined,
      postalCode: address?.postalCode || undefined,
      phone: location.phoneNumber || undefined,
      timezone: location.timezone || undefined
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to fetch Square location: ${String(error)}`);
  }
}

/**
 * Fetches a full Square order by order ID
 * @param vendor - Vendor object with Square credentials
 * @param orderId - Square order ID to fetch
 * @returns Raw Square order JSON
 */
export async function getSquareOrder(
  vendor: Vendor,
  orderId: string
): Promise<Record<string, unknown>> {
  const square = squareClientForVendor(vendor);
  
  try {
    const { result } = await square.ordersApi.retrieveOrder(orderId);
    
    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map(e => e.detail || e.code).join(', ');
      throw new Error(`Square API error for order ${orderId}: ${errorMessages}`);
    }
    
    if (!result.order) {
      throw new Error(`Order ${orderId} not found`);
    }
    
    // Cast to Record<string, unknown> since Square SDK types are complex
    return result.order as unknown as Record<string, unknown>;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch Square order ${orderId}: ${errorMessage}`);
  }
}

/**
 * Lists Square order IDs that were updated since a given timestamp
 * @param vendor - Vendor object with Square credentials
 * @param locationId - Square location ID to search
 * @param updatedSinceISO - ISO timestamp string (e.g., "2024-01-01T00:00:00Z")
 * @returns Array of order IDs
 */
export async function listSquareOrdersUpdatedSince(
  vendor: Vendor,
  locationId: string,
  updatedSinceISO: string
): Promise<string[]> {
  const square = squareClientForVendor(vendor);
  
  try {
    const { result } = await square.ordersApi.searchOrders({
      locationIds: [locationId],
      query: {
        filter: {
          stateFilter: {
            states: ['OPEN', 'COMPLETED', 'CANCELED']
          },
          dateTimeFilter: {
            updatedAt: {
              startAt: updatedSinceISO
            }
          }
        },
        sort: {
          sortField: 'UPDATED_AT',
          sortOrder: 'DESC'
        }
      },
      limit: 100 // Square's max is 100 per page
    });
    
    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map(e => e.detail || e.code).join(', ');
      throw new Error(`Square API error searching orders: ${errorMessages}`);
    }
    
    // Extract order IDs from the results
    const orderIds: string[] = [];
    if (result.orders) {
      for (const order of result.orders) {
        if (order.id) {
          orderIds.push(order.id);
        }
      }
    }
    
    // Handle pagination if there are more results
    let cursor = result.cursor;
    while (cursor && orderIds.length < 1000) { // Safety limit
      const { result: nextResult } = await square.ordersApi.searchOrders({
        locationIds: [locationId],
        query: {
          filter: {
            stateFilter: {
              states: ['OPEN', 'COMPLETED', 'CANCELED']
            },
            dateTimeFilter: {
              updatedAt: {
                startAt: updatedSinceISO
              }
            }
          },
          sort: {
            sortField: 'UPDATED_AT',
            sortOrder: 'DESC'
          }
        },
        cursor,
        limit: 100
      });
      
      if (nextResult.errors && nextResult.errors.length > 0) {
        // Log but don't fail - we got some results
        console.warn('Square API pagination error:', nextResult.errors);
        break;
      }
      
      if (nextResult.orders) {
        for (const order of nextResult.orders) {
          if (order.id) {
            orderIds.push(order.id);
          }
        }
      }
      
      cursor = nextResult.cursor;
      if (!cursor) break;
    }
    
    return orderIds;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list Square orders updated since ${updatedSinceISO}: ${errorMessage}`);
  }
}

