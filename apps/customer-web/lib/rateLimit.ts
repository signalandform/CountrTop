import type { NextApiRequest, NextApiResponse } from 'next';

type RateLimitConfig = {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string; // Custom error message
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

// In-memory store (in production, use Redis or similar)
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Gets the client identifier for rate limiting.
 * Uses IP address from request headers.
 */
function getClientId(req: NextApiRequest): string {
  // Try various headers that might contain the real IP
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  
  let ip = '';
  if (typeof forwarded === 'string') {
    ip = forwarded.split(',')[0].trim();
  } else if (typeof realIp === 'string') {
    ip = realIp;
  } else if (typeof cfConnectingIp === 'string') {
    ip = cfConnectingIp;
  } else if (req.socket?.remoteAddress) {
    ip = req.socket.remoteAddress;
  }
  
  // Fallback to a default if no IP found
  return ip || 'unknown';
}

/**
 * Creates a rate limiting middleware for Next.js API routes.
 * 
 * @example
 * ```ts
 * const rateLimit = createRateLimit({ windowMs: 60000, maxRequests: 100 });
 * export default rateLimit(async (req, res) => { ... });
 * ```
 */
export function createRateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests, message = 'Too many requests, please try again later.' } = config;

  return (handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      const clientId = getClientId(req);
      const now = Date.now();
      const key = `${clientId}:${req.url}`;

      // Clean up expired entries periodically (simple cleanup)
      if (rateLimitStore.size > 10000) {
        // Only clean up if store is getting large
        for (const [k, entry] of rateLimitStore.entries()) {
          if (entry.resetAt < now) {
            rateLimitStore.delete(k);
          }
        }
      }

      const entry = rateLimitStore.get(key);

      if (!entry || entry.resetAt < now) {
        // Create new entry or reset expired entry
        rateLimitStore.set(key, {
          count: 1,
          resetAt: now + windowMs
        });
        return handler(req, res);
      }

      if (entry.count >= maxRequests) {
        // Rate limit exceeded
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());
        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());
        return res.status(429).json({
          ok: false,
          error: message,
          retryAfter
        });
      }

      // Increment count
      entry.count++;
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
      res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());

      return handler(req, res);
    };
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  // Catalog endpoint: 100 requests per minute
  catalog: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many catalog requests. Please wait a moment before trying again.'
  }),
  
  // Checkout endpoint: 10 requests per minute (more restrictive)
  checkout: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many checkout attempts. Please wait a moment before trying again.'
  }),
  
  // General API: 100 requests per minute
  general: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many requests. Please try again later.'
  })
};

