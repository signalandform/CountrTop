import type { AppProps } from 'next/app';
import Head from 'next/head';

import { validateEnvProduction, customerWebEnvSchema } from '@countrtop/models';
import { ErrorBoundary } from '@countrtop/ui';
import '../styles/globals.css';

// Validate environment variables on startup (fail fast in production, warn in development)
if (typeof window === 'undefined') {
  // Server-side validation
  try {
    validateEnvProduction(customerWebEnvSchema, 'customer-web');
  } catch (error) {
    console.error('Environment validation failed:', error);
    // In production, this will throw and prevent the app from starting
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
}

export default function CustomerWebApp({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log to console in development
        if (process.env.NODE_ENV === 'development') {
          console.error('Application error:', error, errorInfo);
        }
        // In production, send to monitoring service
        // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
      }}
    >
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
    </ErrorBoundary>
  );
}
