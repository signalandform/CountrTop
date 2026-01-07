import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/auth-helpers-nextjs';

import type { Database } from '@countrtop/data';

type SetSessionRequest = {
  access_token: string;
  refresh_token: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { access_token, refresh_token } = req.body as SetSessionRequest;

  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: 'Missing access_token or refresh_token' });
  }

  try {
    // Collect cookies to set (multiple cookies need to be set as an array)
    const cookiesToSet: string[] = [];
    
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
      {
        cookies: {
          get(name: string) {
            return req.cookies[name] ?? undefined;
          },
          set(name: string, value: string, options?: CookieOptions) {
            // Build proper cookie string with semicolon separators
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

    // Set the session using the provided tokens
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token
    });

    if (error) {
      console.error('Error setting session:', error);
      return res.status(400).json({ error: error.message });
    }

    // Set all cookies at once (important: setHeader with array for multiple Set-Cookie headers)
    if (cookiesToSet.length > 0) {
      res.setHeader('Set-Cookie', cookiesToSet);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Unexpected error setting session:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

