import type { NextApiRequest, NextApiResponse } from 'next';
import type { GetServerSidePropsContext } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import { requireKDSSession } from '../../../../lib/auth';

type TimeClockRequest = {
  pin: string;
  action: 'clock-in' | 'clock-out';
};

type TimeClockResponse =
  | { ok: true; data: { employeeName: string; action: string; clockInAt?: string; clockOutAt?: string } }
  | { ok: false; error: string };

/**
 * POST /api/vendors/[slug]/time-clock
 * 
 * Clock in or clock out an employee using their 3-digit PIN
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TimeClockResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slugParam = req.query.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ ok: false, error: 'Vendor slug is required' });
  }

  // Create a mock context for requireKDSSession
  const mockContext = {
    req: req,
    res: res,
    query: req.query,
    params: { slug }
  } as unknown as GetServerSidePropsContext;

  // Authenticate KDS session
  const authResult = await requireKDSSession(mockContext, slug, null);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode || 401).json({
      ok: false,
      error: authResult.error || 'Unauthorized'
    });
  }

  try {
    // Get data client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }
    const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase: supabaseAdmin });
    
    const vendor = await dataClient.getVendorBySlug(slug);

    if (!vendor) {
      return res.status(404).json({ ok: false, error: 'Vendor not found' });
    }

    const { pin, action }: TimeClockRequest = req.body;

    if (!pin || typeof pin !== 'string' || !/^\d{3}$/.test(pin)) {
      return res.status(400).json({ ok: false, error: 'PIN must be exactly 3 digits' });
    }

    if (action !== 'clock-in' && action !== 'clock-out') {
      return res.status(400).json({ ok: false, error: 'Action must be clock-in or clock-out' });
    }

    // Find employee by PIN
    const employee = await dataClient.getEmployeeByPin(vendor.id, pin);
    if (!employee) {
      return res.status(404).json({ ok: false, error: 'Invalid PIN' });
    }

    const locationId = authResult.session.locationId || null;

    if (action === 'clock-in') {
      const timeEntry = await dataClient.clockIn(vendor.id, employee.id, locationId);
      return res.status(200).json({
        ok: true,
        data: {
          employeeName: employee.name,
          action: 'clock-in',
          clockInAt: timeEntry.clockInAt
        }
      });
    } else {
      const timeEntry = await dataClient.clockOut(vendor.id, employee.id);
      return res.status(200).json({
        ok: true,
        data: {
          employeeName: employee.name,
          action: 'clock-out',
          clockOutAt: timeEntry.clockOutAt || undefined
        }
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Time clock error:', error);
    return res.status(500).json({
      ok: false,
      error: `Failed to process time clock: ${errorMessage}`
    });
  }
}

