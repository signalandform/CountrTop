import * as Sentry from '@sentry/nextjs';

export type SentryConfig = {
  dsn?: string;
  environment?: string;
  release?: string;
  appName: string;
};

/**
 * Initialize Sentry for error monitoring
 * Call this in your app's instrumentation file or _app.tsx
 */
export function initSentry(config: SentryConfig) {
  const dsn = config.dsn || process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
  
  if (!dsn) {
    console.warn(`[${config.appName}] Sentry DSN not configured, error monitoring disabled`);
    return;
  }

  Sentry.init({
    dsn,
    environment: config.environment || process.env.NODE_ENV || 'development',
    release: config.release || process.env.VERCEL_GIT_COMMIT_SHA,
    
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Session replay (only in production)
    replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,
    
    // Filter out noisy errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',
      'http://tt.teletrader.com/',
      'jigsaw is not defined',
      'ComboSearch is not defined',
      'http://loading.retry.widdit.com/',
      'atomicFindClose',
      // Facebook borked
      'fb_xd_fragment',
      // ISP "optimizations"
      'bmi_SafeAddOnload',
      'EBCallBackMessageReceived',
      // Network errors
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      'NetworkError',
      // AbortError is expected for cancelled requests
      'AbortError',
      // User cancelled
      'User cancelled',
    ],
    
    beforeSend(event, hint) {
      // Filter out events that are just noise
      const error = hint.originalException;
      
      // Don't send events for 4xx errors (expected user errors)
      if (error instanceof Error && error.message.includes('status 4')) {
        return null;
      }
      
      return event;
    },
    
    // Tag all events with the app name
    initialScope: {
      tags: {
        app: config.appName,
      },
    },
  });
  
  console.info(`[${config.appName}] Sentry initialized`);
}

/**
 * Capture an exception with optional context
 */
export function captureException(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id?: string; email?: string };
  }
) {
  Sentry.withScope((scope) => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    if (context?.user) {
      scope.setUser(context.user);
    }
    Sentry.captureException(error);
  });
}

/**
 * Capture a message with optional level
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug' = 'info'
) {
  Sentry.captureMessage(message, level);
}

/**
 * Set user context for all subsequent events
 */
export function setUser(user: { id?: string; email?: string; username?: string } | null) {
  Sentry.setUser(user);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
  message: string;
  category?: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, unknown>;
}) {
  Sentry.addBreadcrumb(breadcrumb);
}

// Re-export Sentry for direct access if needed
export { Sentry };
