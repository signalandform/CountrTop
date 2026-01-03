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
          <p className="message">You don't have permission to access this resource.</p>
          <Link href="/login" className="button">
            Go to Login
          </Link>
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
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
            color: #888;
            margin: 0 0 32px;
          }

          .button {
            display: inline-block;
            padding: 16px 24px;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

