import type { AppProps } from 'next/app';

export default function CustomerWebApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
