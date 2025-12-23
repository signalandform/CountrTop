import type { GetServerSideProps } from 'next';
import Head from 'next/head';

import { resolveVendorSlugFromHost } from '@countrtop/data';

type CustomerHomeProps = {
  vendorSlug: string | null;
};

export const getServerSideProps: GetServerSideProps<CustomerHomeProps> = async ({ req }) => {
  const fallback = process.env.DEFAULT_VENDOR_SLUG;
  const vendorSlug = resolveVendorSlugFromHost(req.headers.host, fallback);
  return {
    props: {
      vendorSlug: vendorSlug ?? null
    }
  };
};

export default function CustomerHome({ vendorSlug }: CustomerHomeProps) {
  return (
    <>
      <Head>
        <title>CountrTop Customer Web</title>
      </Head>
      <main style={{ padding: 32, fontFamily: 'Inter, sans-serif' }}>
        <h1 style={{ marginBottom: 8 }}>CountrTop Customer Web</h1>
        <p style={{ color: '#6b7280' }}>Canonical customer experience (v0.1 scaffold).</p>
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 12,
            border: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}
        >
          <div style={{ fontWeight: 600 }}>Resolved vendor</div>
          <div style={{ color: '#111827', fontSize: 18 }}>
            {vendorSlug ?? 'No vendor resolved'}
          </div>
        </div>
      </main>
    </>
  );
}
