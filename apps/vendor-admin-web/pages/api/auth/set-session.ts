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

  // Collect cookies to set (multiple cookies need to be set as an array)
  const cookiesToSet: string[] = [];
  
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

  // Set the session using the tokens provided
  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token
  });

  if (error) {
    return res.status(401).json({ success: false, error: error.message });
  }

  // Set all cookies at once (important: setHeader with array for multiple Set-Cookie headers)
  if (cookiesToSet.length > 0) {
    res.setHeader('Set-Cookie', cookiesToSet);
  }

  return res.status(200).json({ success: true });
}

