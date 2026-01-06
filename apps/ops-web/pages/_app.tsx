import type { AppProps } from 'next/app';
import Head from 'next/head';

import { ErrorBoundary } from '@countrtop/ui';
import '../styles/globals.css';

export default function OpsApp({ Component, pageProps }: AppProps) {
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

