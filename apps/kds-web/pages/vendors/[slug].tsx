import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';

import { getBrowserSupabaseClient } from '../../lib/supabaseBrowser';
import { requireVendorAdmin } from '../../lib/auth';

type VendorPageProps = {
  vendorSlug: string;
};

export const getServerSideProps: GetServerSideProps<VendorPageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  // Check vendor admin access
  const authResult = await requireVendorAdmin(context, slug ?? null);
  if (!authResult.authorized) {
    if (authResult.redirect) {
      return { redirect: authResult.redirect };
    }
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }

  return {
    props: {
      vendorSlug: slug ?? 'unknown'
    }
  };
};

export default function VendorQueuePage({ vendorSlug }: VendorPageProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = getBrowserSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
      router.push('/login');
    }
  };

  return (
    <>
      <Head>
        <title>{vendorSlug} - CountrTop KDS</title>
      </Head>
      <main className="page">
        <div className="container">
          <header className="header">
            <div>
              <h1 className="title">CountrTop KDS</h1>
              <p className="vendor-slug">Vendor: {vendorSlug}</p>
            </div>
            <button onClick={handleSignOut} className="sign-out-button">
              Sign Out
            </button>
          </header>

          <div className="queue-placeholder">
            <div className="placeholder-icon">📋</div>
            <h2>Queue Coming Soon</h2>
            <p>The order queue will appear here.</p>
          </div>
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
            color: #e8e8e8;
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 24px;
          }

          .container {
            max-width: 1200px;
            margin: 0 auto;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 48px;
            padding-bottom: 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .title {
            font-size: 32px;
            font-weight: 700;
            margin: 0 0 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .vendor-slug {
            font-size: 16px;
            color: #888;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .sign-out-button {
            padding: 12px 20px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.05);
            color: #e8e8e8;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
            font-family: inherit;
          }

          .sign-out-button:hover {
            background: rgba(255, 255, 255, 0.1);
          }

          .queue-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 400px;
            text-align: center;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 20px;
            padding: 48px;
          }

          .placeholder-icon {
            font-size: 64px;
            margin-bottom: 24px;
          }

          .queue-placeholder h2 {
            font-size: 24px;
            font-weight: 700;
            margin: 0 0 12px;
            color: #e8e8e8;
          }

          .queue-placeholder p {
            font-size: 16px;
            color: #888;
            margin: 0;
          }
        `}</style>
      </main>
    </>
  );
}

