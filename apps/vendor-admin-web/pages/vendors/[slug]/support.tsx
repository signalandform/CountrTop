import type { GetServerSideProps } from 'next';
import { requireVendorAdmin } from '../../../lib/auth';

export const getServerSideProps: GetServerSideProps = async (context) => {
  const slugParam = context.params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  const authResult = await requireVendorAdmin(context, slug ?? null);
  if (!authResult.authorized && authResult.redirect) {
    return { redirect: authResult.redirect };
  }

  return {
    redirect: {
      destination: `/vendors/${slug ?? 'unknown'}/help`,
      permanent: false
    }
  };
};

export default function VendorSupportRedirect() {
  return null;
}
