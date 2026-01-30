import Head from 'next/head';
import Link from 'next/link';

export default function AccessDeniedPage() {
  return (
    <>
      <Head>
        <title>Access Denied - CountrTop KDS</title>
      </Head>
      <main className="page">
        <div className="container">
          <h1 className="title">Access Denied</h1>
          <p className="message">You don&apos;t have permission to access this resource.</p>
          <Link href="/login" className="button">
            Go to Login
          </Link>
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
          background: var(--ct-bg-primary);
          color: var(--ct-text);
          font-family: var(--ct-font-body);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }

          .container {
            max-width: 400px;
            width: 100%;
            text-align: center;
          }

          .title {
            font-size: 36px;
            font-weight: 700;
            margin: 0 0 16px;
            color: #fca5a5;
          }

          .message {
            font-size: 16px;
          color: var(--color-text-muted);
            margin: 0 0 32px;
          }

          .button {
            display: inline-block;
            padding: 16px 24px;
            border-radius: 12px;
            border: none;
          background: var(--ct-gradient-primary);
            color: white;
            font-weight: 600;
            font-size: 16px;
            text-decoration: none;
            transition: opacity 0.2s;
            font-family: inherit;
          }

          .button:hover {
            opacity: 0.9;
          }
        `}</style>
      </main>
    </>
  );
}

