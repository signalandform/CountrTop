import type { AppProps } from 'next/app';
import Head from 'next/head';

import { captureException } from '@countrtop/monitoring';
import { validateEnvProduction, vendorAdminWebEnvSchema } from '@countrtop/models';
import { ErrorBoundary } from '@countrtop/ui';
import '@countrtop/ui/theme.css';
import '../styles/globals.css';

// Validate environment variables on startup (fail fast in production, warn in development)
if (typeof window === 'undefined') {
  // Server-side validation
  try {
    validateEnvProduction(vendorAdminWebEnvSchema, 'vendor-admin-web');
  } catch (error) {
    console.error('Environment validation failed:', error);
    // In production, this will throw and prevent the app from starting
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
}

export default function VendorAdminApp({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log to console in development
        if (process.env.NODE_ENV === 'development') {
          console.error('Application error:', error, errorInfo);
        }
        captureException(error, { extra: { componentStack: errorInfo?.componentStack } });
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

