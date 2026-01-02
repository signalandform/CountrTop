import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/auth-helpers-nextjs';

import type { Database } from '@countrtop/data';

type SetSessionResponse = { success: true } | { success: false; error: string };

/**
 * API route to set session cookies from a client-side session token.
 * This is needed because Supabase's browser client stores sessions in localStorage,
 * but server-side code needs cookies to authenticate.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SetSessionResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { access_token, refresh_token } = req.body;

  if (!access_token || !refresh_token) {
    return res.status(400).json({ success: false, error: 'Missing access_token or refresh_token' });
  }

  // Create server client to set session cookies
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

  // Set the session using the tokens provided
  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token
  });

  if (error) {
    return res.status(401).json({ success: false, error: error.message });
  }

  return res.status(200).json({ success: true });
}

