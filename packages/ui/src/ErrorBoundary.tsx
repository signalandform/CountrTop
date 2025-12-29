import React, { Component, ErrorInfo, ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

/**
 * Error Boundary component for React applications.
 * Catches JavaScript errors in child components, logs them, and displays a fallback UI.
 * 
 * For React Native apps, this works the same way as React web apps.
 * 
 * @example
 * ```tsx
 * <ErrorBoundary
 *   onError={(error, errorInfo) => {
 *     // Send to monitoring service
 *     console.error('Error caught:', error, errorInfo);
 *   }}
 * >
 *   <App />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch (handlerError) {
        console.error('[ErrorBoundary] Error in onError handler:', handlerError);
      }
    }

    // In production, send to monitoring service
    // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });

    this.setState({
      error,
      errorInfo
    });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <DefaultErrorFallback error={this.state.error} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

type DefaultErrorFallbackProps = {
  error: Error | null;
  onRetry: () => void;
};

/**
 * Default error fallback UI component.
 * Can be customized by passing a custom fallback prop to ErrorBoundary.
 */
function DefaultErrorFallback({ error, onRetry }: DefaultErrorFallbackProps) {
  // Check if we're in React Native environment
  // Use a safer check that doesn't require() at build time
  const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';
  const isReactNative = !isWeb && typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

  // Always use web fallback for Next.js/web builds
  // React Native apps will handle this differently
  if (isWeb || !isReactNative) {
    return (
      <div style={webStyles.container}>
        <div style={webStyles.content}>
          <h1 style={webStyles.title}>Something went wrong</h1>
          <p style={webStyles.message}>
            {error?.message || 'An unexpected error occurred'}
          </p>
          {error?.stack && (
            <details style={webStyles.details}>
              <summary style={webStyles.summary}>Error details</summary>
              <pre style={webStyles.stack}>{error.stack}</pre>
            </details>
          )}
          <button style={webStyles.button} onClick={onRetry}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // For React Native, this will be handled by the mobile app's ErrorBoundary wrapper
  // Return a simple message as fallback
  return (
    <div style={webStyles.container}>
      <div style={webStyles.content}>
        <h1 style={webStyles.title}>Something went wrong</h1>
        <p style={webStyles.message}>
          {error?.message || 'An unexpected error occurred'}
        </p>
        <button style={webStyles.button} onClick={onRetry}>
          Try Again
        </button>
      </div>
    </div>
  );
}

// React Native styles
const styles = {
  container: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: '#f8fafc',
    padding: 20
  },
  content: {
    maxWidth: 400,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#1e293b',
    marginBottom: 12
  },
  message: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 24,
    lineHeight: 24
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center' as const
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const
  }
};

// React web styles
const webStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    padding: '20px'
  },
  content: {
    maxWidth: '500px',
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1e293b',
    marginBottom: '12px',
    margin: 0
  },
  message: {
    fontSize: '16px',
    color: '#64748b',
    marginBottom: '24px',
    lineHeight: '24px',
    margin: 0
  },
  details: {
    marginBottom: '24px',
    fontSize: '14px'
  },
  summary: {
    cursor: 'pointer',
    color: '#3b82f6',
    marginBottom: '8px',
    fontWeight: 600
  },
  stack: {
    backgroundColor: '#f1f5f9',
    padding: '12px',
    borderRadius: '6px',
    overflow: 'auto',
    fontSize: '12px',
    color: '#475569',
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  button: {
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%'
  }
};

