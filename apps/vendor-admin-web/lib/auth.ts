import type { GetServerSidePropsContext } from 'next';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/auth-helpers-nextjs';

import type { Database } from '@countrtop/data';

export type AuthResult =
  | { authorized: true; userId: string; vendorId: string }
  | { authorized: false; redirect?: { destination: string; permanent: boolean }; statusCode?: number; error?: string };


/**
 * Verify vendor admin access for a given vendor slug
 * Returns auth result with redirect/error if unauthorized
 */
export const verifyVendorAdminAccess = async (
  vendorSlug: string,
  userId: string | null
): Promise<AuthResult> => {
  if (!userId) {
    return {
      authorized: false,
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }

  // Use service role client to read vendors table (bypasses RLS)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return {
      authorized: false,
      error: 'Server configuration error'
    };
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });

  const { data: vendor, error } = await supabase
    .from('vendors')
    .select('id, admin_user_id')
    .eq('slug', vendorSlug)
    .single();

  if (error || !vendor) {
    return {
      authorized: false,
      error: 'Vendor not found'
    };
  }

  if (vendor.admin_user_id !== userId) {
    return {
      authorized: false,
      redirect: {
        destination: '/access-denied',
        permanent: false
      },
      statusCode: 403,
      error: 'Access denied: You are not authorized to access this vendor admin'
    };
  }

  return {
    authorized: true,
    userId,
    vendorId: vendor.id
  };
};

/**
 * Auth guard for getServerSideProps
 * Use in getServerSideProps to protect vendor admin pages
 */
export const requireVendorAdmin = async (
  context: GetServerSidePropsContext,
  vendorSlug: string | null
): Promise<AuthResult> => {
  if (!vendorSlug) {
    return {
      authorized: false,
      error: 'Vendor slug required'
    };
  }

  // Collect cookies to set (multiple cookies need to be set as an array)
  const cookiesToSet: string[] = [];
  
  // Use Supabase auth helpers to get user from session
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        get(name: string) {
          return context.req.cookies[name] ?? undefined;
        },
        set(name: string, value: string, options?: CookieOptions) {
          const parts = [`${name}=${value}`];
          if (options?.maxAge) parts.push(`Max-Age=${options.maxAge}`);
          if (options?.path) parts.push(`Path=${options.path}`);
          if (options?.sameSite) parts.push(`SameSite=${options.sameSite}`);
          if (options?.httpOnly) parts.push('HttpOnly');
          if (options?.secure) parts.push('Secure');
          cookiesToSet.push(parts.join('; '));
        },
        remove(name: string, options?: CookieOptions) {
          const parts = [`${name}=`, 'Max-Age=0'];
          if (options?.path) parts.push(`Path=${options.path}`);
          cookiesToSet.push(parts.join('; '));
        }
      }
    }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  
  // Set any cookies that were collected during auth
  if (cookiesToSet.length > 0) {
    context.res.setHeader('Set-Cookie', cookiesToSet);
  }
  
  if (error || !user) {
    return {
      authorized: false,
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }

  return verifyVendorAdminAccess(vendorSlug, user.id);
};

/**
 * Auth guard for API routes
 * Use in API route handlers to protect vendor admin APIs
 */
export const requireVendorAdminApi = async (
  req: NextApiRequest,
  res: NextApiResponse,
  vendorSlug: string | null
): Promise<AuthResult> => {
  if (!vendorSlug) {
    return {
      authorized: false,
      statusCode: 400,
      error: 'Vendor slug required'
    };
  }

  // Collect cookies to set (multiple cookies need to be set as an array)
  const cookiesToSet: string[] = [];
  
  // Use Supabase auth helpers to get user from session
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        get(name: string) {
          return req.cookies[name] ?? undefined;
        },
        set(name: string, value: string, options?: CookieOptions) {
          const parts = [`${name}=${value}`];
          if (options?.maxAge) parts.push(`Max-Age=${options.maxAge}`);
          if (options?.path) parts.push(`Path=${options.path}`);
          if (options?.sameSite) parts.push(`SameSite=${options.sameSite}`);
          if (options?.httpOnly) parts.push('HttpOnly');
          if (options?.secure) parts.push('Secure');
          cookiesToSet.push(parts.join('; '));
        },
        remove(name: string, options?: CookieOptions) {
          const parts = [`${name}=`, 'Max-Age=0'];
          if (options?.path) parts.push(`Path=${options.path}`);
          cookiesToSet.push(parts.join('; '));
        }
      }
    }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  
  // Set any cookies that were collected during auth
  if (cookiesToSet.length > 0) {
    res.setHeader('Set-Cookie', cookiesToSet);
  }
  
  if (error || !user) {
    return {
      authorized: false,
      statusCode: 401,
      error: 'Unauthorized'
    };
  }

  return verifyVendorAdminAccess(vendorSlug, user.id);
};

