import type { GetServerSidePropsContext } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/auth-helpers-nextjs';

import type { Database } from '@countrtop/data';

export type AuthResult =
  | { authorized: true; userId: string; vendorId: string }
  | { authorized: false; redirect?: { destination: string; permanent: boolean }; statusCode?: number; error?: string };

export type KDSSession = {
  vendorSlug: string;
  locationId: string;
  vendorId: string;
  expiresAt: string;
};

export type KDSAuthResult =
  | { authorized: true; session: KDSSession }
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
      error: 'Access denied: You are not authorized to access this vendor'
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
 * Use in getServerSideProps to protect vendor pages
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
          context.res.setHeader('Set-Cookie', `${name}=${value}; ${options?.maxAge ? `Max-Age=${options.maxAge};` : ''} ${options?.path ? `Path=${options.path};` : ''} ${options?.sameSite ? `SameSite=${options.sameSite};` : ''} ${options?.httpOnly ? 'HttpOnly;' : ''} ${options?.secure ? 'Secure;' : ''}`);
        },
        remove(name: string, options?: CookieOptions) {
          context.res.setHeader('Set-Cookie', `${name}=; Max-Age=0; ${options?.path ? `Path=${options.path};` : ''}`);
        }
      }
    }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  
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
 * Parse KDS session token from request
 * Checks both cookies and query params for session token
 */
function parseKDSSession(context: GetServerSidePropsContext): KDSSession | null {
  // Check query params first (for initial redirect)
  const sessionTokenParam = context.query.sessionToken as string | undefined;
  if (sessionTokenParam) {
    try {
      const sessionData = JSON.parse(Buffer.from(sessionTokenParam, 'base64').toString());
      if (sessionData.expiresAt && new Date(sessionData.expiresAt) > new Date()) {
        return sessionData as KDSSession;
      }
    } catch {
      // Invalid token
    }
  }

  // Check cookies (for subsequent requests)
  const sessionCookie = context.req.cookies.kds_session;
  if (sessionCookie) {
    try {
      const sessionData = JSON.parse(sessionCookie);
      if (sessionData.expiresAt && new Date(sessionData.expiresAt) > new Date()) {
        return sessionData as KDSSession;
      }
    } catch {
      // Invalid session
    }
  }

  return null;
}

/**
 * KDS session auth guard
 * Verifies KDS session token and returns session data
 */
export const requireKDSSession = async (
  context: GetServerSidePropsContext,
  vendorSlug: string | null,
  locationId?: string | null
): Promise<KDSAuthResult> => {
  const session = parseKDSSession(context);

  if (!session) {
    return {
      authorized: false,
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }

  // Verify vendor slug matches (if provided)
  if (vendorSlug && session.vendorSlug !== vendorSlug) {
    return {
      authorized: false,
      redirect: {
        destination: '/login',
        permanent: false
      },
      error: 'Vendor mismatch'
    };
  }

  // Verify location ID matches (if provided)
  if (locationId && session.locationId !== locationId) {
    return {
      authorized: false,
      redirect: {
        destination: '/login',
        permanent: false
      },
      error: 'Location mismatch'
    };
  }

  return {
    authorized: true,
    session
  };
};

