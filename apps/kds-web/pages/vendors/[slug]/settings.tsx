import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { requireKDSSession } from '../../../lib/auth';

type SettingsPageProps = {
  vendorSlug: string;
  vendorName: string;
  locationId: string;
};

export const getServerSideProps: GetServerSideProps<SettingsPageProps> = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const locationIdParam = context.query.locationId as string | undefined;

  const authResult = await requireKDSSession(context, slug ?? null, locationIdParam ?? null);
  if (!authResult.authorized) {
    const loginDestination = slug
      ? `/login?vendorSlug=${encodeURIComponent(slug)}`
      : '/login';
    return {
      redirect: {
        destination: loginDestination,
        permanent: false
      }
    };
  }

  const locationId = locationIdParam || authResult.session.locationId;

  return {
    props: {
      vendorSlug: slug ?? 'unknown',
      vendorName: 'KDS',
      locationId
    }
  };
};

export default function KDSSettingsPage({ vendorSlug, vendorName, locationId }: SettingsPageProps) {
  const backHref = `/vendors/${vendorSlug}${locationId ? `?locationId=${locationId}` : ''}`;

  return (
    <>
      <Head>
        <title>Settings · {vendorName} - KDS</title>
      </Head>
      <main className="page">
        <div className="container">
          <h1 className="title">Settings</h1>
          <p className="coming-soon">Coming soon.</p>
          <Link href={backHref} className="back-link">
            Back to KDS
          </Link>
        </div>
        <style jsx>{`
          .page {
            min-height: 100vh;
            background: var(--ct-bg-primary);
            color: var(--ct-text);
            font-family: var(--ct-font-body);
            padding: 32px;
            display: flex;
            align-items: flex-start;
            justify-content: center;
          }
          .container {
            max-width: 560px;
            width: 100%;
          }
          .title {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 16px;
            background: var(--ct-gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .coming-soon {
            color: var(--color-text-muted);
            font-size: 16px;
            margin: 0 0 24px;
          }
          .back-link {
            display: inline-block;
            padding: 12px 20px;
            border-radius: 12px;
            border: 1px solid var(--color-border);
            background: var(--ct-bg-surface);
            color: var(--ct-text);
            font-weight: 600;
            font-size: 14px;
            text-decoration: none;
            transition: background 0.2s, border-color 0.2s;
          }
          .back-link:hover {
            background: var(--color-bg-warm);
            border-color: var(--color-primary);
          }
        `}</style>
      </main>
    </>
  );
}
