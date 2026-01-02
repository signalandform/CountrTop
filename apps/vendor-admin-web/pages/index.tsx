import type { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/auth-helpers-nextjs';

import type { Database } from '@countrtop/data';

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Get authenticated user using Supabase auth helpers
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        get(name: string) {
          return context.req.cookies[name] ?? undefined;
        },
        set(name: string, value: string, options?: any) {
          context.res.setHeader('Set-Cookie', `${name}=${value}; ${options?.maxAge ? `Max-Age=${options.maxAge};` : ''} ${options?.path ? `Path=${options.path};` : ''} ${options?.sameSite ? `SameSite=${options.sameSite};` : ''} ${options?.httpOnly ? 'HttpOnly;' : ''} ${options?.secure ? 'Secure;' : ''}`);
        },
        remove(name: string, options?: any) {
          context.res.setHeader('Set-Cookie', `${name}=; Max-Age=0; ${options?.path ? `Path=${options.path};` : ''}`);
        }
      }
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  // If no user, redirect to login
  if (error || !user) {
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }

  // Find vendor where admin_user_id matches the authenticated user
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return {
      redirect: {
        destination: '/access-denied',
        permanent: false
      }
    };
  }

  const serviceSupabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });

  // Query for vendor(s) where admin_user_id matches user.id
  // If multiple vendors exist, pick the first one (optional: could order by created_at desc)
  const { data: vendors, error: vendorError } = await serviceSupabase
    .from('vendors')
    .select('slug')
    .eq('admin_user_id', user.id)
    .limit(1);

  if (vendorError || !vendors || vendors.length === 0) {
    // No vendor found for this admin user
    return {
      redirect: {
        destination: '/access-denied',
        permanent: false
      }
    };
  }

  // Redirect to the vendor's orders page
  const vendorSlug = vendors[0].slug;
  return {
    redirect: {
      destination: `/vendors/${vendorSlug}/orders`,
      permanent: false
    }
  };
};

export default function VendorAdminRoot() {
  // This component should never render since we always redirect
  return null;
}
