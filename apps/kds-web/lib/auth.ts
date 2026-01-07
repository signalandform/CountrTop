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
      // Try to parse as base64 first (new format), then fall back to JSON (old format)
      let sessionData: KDSSession;
      try {
        // Try base64 decode first
        sessionData = JSON.parse(Buffer.from(sessionCookie, 'base64').toString());
      } catch {
        // Fall back to direct JSON parse (for backwards compatibility)
        sessionData = JSON.parse(sessionCookie);
      }
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

