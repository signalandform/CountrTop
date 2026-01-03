import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';

export default function KDSHome() {
  const router = useRouter();
  const [vendorSlug, setVendorSlug] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorSlug.trim()) {
      setError('Please enter a vendor slug');
      return;
    }
    router.push(`/vendors/${vendorSlug.trim()}`);
  };

  return (
    <>
      <Head>
        <title>CountrTop KDS</title>
      </Head>
      <main className="page">
        <div className="container">
          <h1 className="title">CountrTop KDS</h1>
          <p className="subtitle">Kitchen Display System</p>
          
          <div className="pwa-banner">
            <p>💡 Tap Share → Add to Home Screen for the best experience</p>
          </div>

          <form onSubmit={handleSubmit} className="form">
            <div className="form-group">
              <label htmlFor="vendorSlug">Enter Vendor Slug</label>
              <input
                id="vendorSlug"
                type="text"
                value={vendorSlug}
                onChange={(e) => {
                  setVendorSlug(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., sunset"
                className="input"
                autoFocus
              />
              {error && <p className="error">{error}</p>}
            </div>
            <button type="submit" className="button">
              Continue →
            </button>
          </form>
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
            font-size: 48px;
            font-weight: 700;
            margin: 0 0 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .subtitle {
            font-size: 18px;
            color: #888;
            margin: 0 0 32px;
          }

          .pwa-banner {
            background: rgba(102, 126, 234, 0.2);
            border: 1px solid rgba(102, 126, 234, 0.3);
            border-radius: 12px;
            padding: 12px 16px;
            margin-bottom: 32px;
            font-size: 14px;
            color: #a78bfa;
          }

          .form {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .form-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
            text-align: left;
          }

          .form-group label {
            font-size: 14px;
            font-weight: 600;
            color: #a78bfa;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .input {
            padding: 16px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-size: 16px;
            font-family: inherit;
            transition: border-color 0.2s;
          }

          .input:focus {
            outline: none;
            border-color: #667eea;
          }

          .error {
            color: #fca5a5;
            font-size: 14px;
            margin: 0;
          }

          .button {
            padding: 16px 24px;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
            transition: opacity 0.2s;
            font-family: inherit;
          }

          .button:hover {
            opacity: 0.9;
          }

          .button:active {
            opacity: 0.8;
          }
        `}</style>
      </main>
    </>
  );
}

