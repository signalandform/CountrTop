import type { AppProps } from 'next/app';
import Head from 'next/head';

import { ErrorBoundary } from '@countrtop/ui';
import '@countrtop/ui/theme.css';
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anybody:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Component {...pageProps} />
    </ErrorBoundary>
  );
}

