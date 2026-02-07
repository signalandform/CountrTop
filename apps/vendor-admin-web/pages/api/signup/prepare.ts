import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash, createDecipheriv } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';

type PrepareRequest = {
  email: string;
  password: string;
  businessName?: string;
};

type PrepareResponse = { ok: true; redirect: string } | { ok: false; error: string };

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextApiRequest): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    (req.headers['x-real-ip'] as string) ??
    'unknown'
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

function getEncryptionKey(): Buffer {
  const secret =
    process.env.SIGNUP_COOKIE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!secret || secret.length < 16) {
    throw new Error('SIGNUP_COOKIE_SECRET or SUPABASE_SERVICE_ROLE_KEY required for signup');
  }
  return createHash('sha256').update(secret + ':signup-cookie').digest();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-+/g, '-') || 'store';
}

function randomAlphanumeric(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function decryptSignupCookie(encrypted: string): { email: string; password: string; businessName?: string } | null {
  try {
    const key = getEncryptionKey();
    const [ivB64, encB64] = encrypted.split('.');
    if (!ivB64 || !encB64) return null;
    const iv = Buffer.from(ivB64, 'base64url');
    const encryptedBuf = Buffer.from(encB64, 'base64url');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const json = Buffer.concat([decipher.update(encryptedBuf), decipher.final()]).toString('utf8');
    const data = JSON.parse(json) as { email: string; password: string; businessName?: string; exp: number };
    if (data.exp && Date.now() > data.exp) return null;
    return { email: data.email, password: data.password, businessName: data.businessName };
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PrepareResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  const body = req.body as PrepareRequest;
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : undefined;

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password are required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ ok: false, error: 'Invalid email format' });
  }

  if (password.length < 8) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
  }

  try {
    const supabase = getSupabase();
    const displayName = businessName?.trim() || 'My Store';
    const baseSlug = slugify(businessName || email.split('@')[0]);

    let slug = baseSlug + '_' + randomAlphanumeric(4);
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: existing } = await supabase
        .from('vendors')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (!existing) break;
      slug = baseSlug + '_' + randomAlphanumeric(6);
    }

    const { data: slugCheck } = await supabase.from('vendors').select('id').eq('slug', slug).maybeSingle();
    if (slugCheck) {
      return res.status(400).json({ ok: false, error: 'Could not create your store. Please try again.' });
    }

    const vendorId = `vendor_${slug}_${Date.now()}`;

    const { error: vendorError } = await supabase.from('vendors').insert({
      id: vendorId,
      slug,
      display_name: displayName,
      square_location_id: '',
      square_credential_ref: null,
      status: 'active'
    });

    if (vendorError) {
      console.error('Signup vendor insert failed:', vendorError);
      return res.status(500).json({ ok: false, error: 'Could not create your store. Please try again.' });
    }

    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('vendor_billing').insert({
      vendor_id: vendorId,
      plan_id: 'trial',
      trial_ends_at: trialEndsAt
    });

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      if (authError.message?.toLowerCase().includes('already') || authError.code === 'user_already_exists') {
        return res.status(400).json({ ok: false, error: 'An account with this email already exists. Sign in instead.' });
      }
      console.error('Signup createUser failed:', authError);
      return res.status(500).json({ ok: false, error: 'Could not create your account. Please try again.' });
    }

    if (!authData?.user?.id) {
      return res.status(500).json({ ok: false, error: 'Could not create your account. Please try again.' });
    }

    await supabase.from('vendors').update({ admin_user_id: authData.user.id }).eq('id', vendorId);

    const redirect = `/login?signup=success&email=${encodeURIComponent(email)}`;
    return res.status(200).json({ ok: true, redirect });
  } catch (err) {
    console.error('Signup prepare error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Server configuration error'
    });
  }
}
