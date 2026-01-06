import type { GetServerSidePropsContext } from 'next';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/auth-helpers-nextjs';

import type { Database } from '@countrtop/data';

export type OpsAuthResult =
  | { authorized: true; userId: string; userEmail: string }
  | { authorized: false; redirect?: { destination: string; permanent: boolean }; statusCode?: number; error?: string };

/**
 * Get allowed admin emails from environment variable
 * Format: "email1@example.com,email2@example.com"
 */
function getAllowedEmails(): string[] {
  const emailsEnv = process.env.OPS_ADMIN_EMAILS;
  if (!emailsEnv) {
    return [];
  }
  return emailsEnv
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);
}

/**
 * Check if an email is in the allowed list
 */
function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowedEmails = getAllowedEmails();
  if (allowedEmails.length === 0) {
    // If no allowlist is set, deny all access (fail secure)
    return false;
  }
  return allowedEmails.includes(email.toLowerCase());
}

/**
 * Auth guard for getServerSideProps
 * Use in getServerSideProps to protect ops dashboard pages
 */
export const requireOpsAdmin = async (
  context: GetServerSidePropsContext
): Promise<OpsAuthResult> => {
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

  // Check if user email is in allowlist
  if (!isEmailAllowed(user.email)) {
    return {
      authorized: false,
      redirect: {
        destination: '/access-denied',
        permanent: false
      },
      statusCode: 403,
      error: 'Access denied: Your email is not authorized to access the ops dashboard'
    };
  }

  return {
    authorized: true,
    userId: user.id,
    userEmail: user.email || ''
  };
};

/**
 * Auth guard for API routes
 * Use in API route handlers to protect ops dashboard APIs
 */
export const requireOpsAdminApi = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<OpsAuthResult> => {
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
          res.setHeader('Set-Cookie', `${name}=${value}; ${options?.maxAge ? `Max-Age=${options.maxAge};` : ''} ${options?.path ? `Path=${options.path};` : ''} ${options?.sameSite ? `SameSite=${options.sameSite};` : ''} ${options?.httpOnly ? 'HttpOnly;' : ''} ${options?.secure ? 'Secure;' : ''}`);
        },
        remove(name: string, options?: CookieOptions) {
          res.setHeader('Set-Cookie', `${name}=; Max-Age=0; ${options?.path ? `Path=${options.path};` : ''}`);
        }
      }
    }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return {
      authorized: false,
      statusCode: 401,
      error: 'Unauthorized'
    };
  }

  // Check if user email is in allowlist
  if (!isEmailAllowed(user.email)) {
    return {
      authorized: false,
      statusCode: 403,
      error: 'Access denied: Your email is not authorized to access the ops dashboard'
    };
  }

  return {
    authorized: true,
    userId: user.id,
    userEmail: user.email || ''
  };
};

