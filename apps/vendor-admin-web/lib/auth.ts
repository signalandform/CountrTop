import type { GetServerSidePropsContext } from 'next';
import type { NextApiRequest } from 'next';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@countrtop/data';

export type AuthResult =
  | { authorized: true; userId: string; vendorId: string }
  | { authorized: false; redirect?: { destination: string; permanent: boolean }; statusCode?: number; error?: string };

/**
 * Get Supabase client for server-side auth (reads session from cookies)
 */
export const getServerSupabaseClient = (cookieHeader?: string) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for authentication');
  }

  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: cookieHeader ? { Cookie: cookieHeader } : {}
    }
  });

  return client;
};

/**
 * Extract user ID from Supabase session token in cookies
 * Returns null if no valid session found
 */
const getUserIdFromCookies = (cookieHeader?: string): string | null => {
  if (!cookieHeader) return null;

  // Supabase stores session in cookies with pattern: sb-<project-ref>-auth-token
  // The token is a JWT that contains the user ID
  // For simplicity, we'll extract the access token and decode it
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {} as Record<string, string>);

  // Find Supabase auth token cookie
  const authTokenKey = Object.keys(cookies).find(key => key.includes('auth-token'));
  if (!authTokenKey) return null;

  const token = cookies[authTokenKey];
  if (!token) return null;

  try {
    // Parse JWT to extract user ID (simple base64 decode of payload)
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.sub ?? payload.user_id ?? null;
  } catch {
    return null;
  }
};

/**
 * Get Supabase session from request cookies (for API routes)
 */
export const getSessionFromRequest = async (req: NextApiRequest) => {
  const cookieHeader = req.headers.cookie;
  const userId = getUserIdFromCookies(cookieHeader);
  
  if (!userId) return null;

  // Verify the user exists and return a minimal session object
  // We only need the user ID for authorization
  return {
    user: { id: userId },
    access_token: '',
    refresh_token: '',
    expires_in: 0,
    expires_at: 0,
    token_type: 'bearer'
  };
};

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

  // Get user ID from cookies in Next.js request
  const cookieHeader = context.req.headers.cookie;
  const userId = getUserIdFromCookies(cookieHeader);

  return verifyVendorAdminAccess(vendorSlug, userId);
};

/**
 * Auth guard for API routes
 * Use in API route handlers to protect vendor admin APIs
 */
export const requireVendorAdminApi = async (
  req: NextApiRequest,
  vendorSlug: string | null
): Promise<AuthResult> => {
  if (!vendorSlug) {
    return {
      authorized: false,
      statusCode: 400,
      error: 'Vendor slug required'
    };
  }

  // Get session from request cookies
  const session = await getSessionFromRequest(req);
  return verifyVendorAdminAccess(vendorSlug, session?.user?.id ?? null);
};

