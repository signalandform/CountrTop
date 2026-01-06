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

    // Set the session using the provided tokens
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token
    });

    if (error) {
      console.error('Error setting session:', error);
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Unexpected error setting session:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

