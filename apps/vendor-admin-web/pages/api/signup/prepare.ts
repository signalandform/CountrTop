import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

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

function getEncryptionKey(): Buffer {
  const secret =
    process.env.SIGNUP_COOKIE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!secret || secret.length < 16) {
    throw new Error('SIGNUP_COOKIE_SECRET or SUPABASE_SERVICE_ROLE_KEY required for signup');
  }
  return createHash('sha256').update(secret + ':signup-cookie').digest();
}

function encrypt(payload: object): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const json = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return iv.toString('base64url') + '.' + encrypted.toString('base64url');
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
    const exp = Date.now() + 10 * 60 * 1000;
    const payload = { email, password, businessName, exp };
    const encrypted = encrypt(payload);

    const isProd = process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie', [
      `signup_pending=${encodeURIComponent(encrypted)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isProd ? '; Secure' : ''}`
    ]);

    return res.status(200).json({
      ok: true,
      redirect: '/api/signup/square-oauth/authorize'
    });
  } catch (err) {
    console.error('Signup prepare error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Server configuration error'
    });
  }
}
