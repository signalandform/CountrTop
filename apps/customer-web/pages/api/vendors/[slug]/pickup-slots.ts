import type { NextApiRequest, NextApiResponse } from 'next';
import { getPickupSlots } from '../../../../lib/pickupSlots';
import { getServerDataClient } from '../../../../lib/dataClient';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';

type PickupSlotsResponse =
  | { ok: true; slots: { start: string; end: string; label: string }[] }
  | { ok: false; error: string };

const normalizeSlug = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PickupSlotsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = normalizeSlug(req.query.slug);
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Vendor slug required' });
  }

  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ ok: false, error: 'Vendor not found' });
  }

  let location: {
    onlineOrderingHoursJson: Record<string, unknown> | null;
    timezone: string | null;
    onlineOrderingLeadTimeMinutes: number;
    scheduledOrderLeadDays: number;
    scheduledOrderSlotMinutes: number;
  } | null = null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    let query = supabase
      .from('vendor_locations')
      .select('online_ordering_hours_json, timezone, online_ordering_lead_time_minutes, scheduled_order_lead_days, scheduled_order_slot_minutes, scheduled_orders_enabled')
      .eq('vendor_id', vendor.id)
      .eq('is_active', true);

    if (locationId) {
      query = query.eq('square_location_id', locationId);
    }

    const { data: rows, error } = await query.order('is_primary', { ascending: false }).limit(1).maybeSingle();

    if (error) {
      return res.status(500).json({ ok: false, error: 'Failed to load location' });
    }

    if (rows && (rows as { scheduled_orders_enabled?: boolean }).scheduled_orders_enabled) {
      location = {
        onlineOrderingHoursJson: rows.online_ordering_hours_json,
        timezone: rows.timezone,
        onlineOrderingLeadTimeMinutes: rows.online_ordering_lead_time_minutes ?? 15,
        scheduledOrderLeadDays: (rows as { scheduled_order_lead_days?: number }).scheduled_order_lead_days ?? 7,
        scheduledOrderSlotMinutes: (rows as { scheduled_order_slot_minutes?: number }).scheduled_order_slot_minutes ?? 30
      };
    }
  }

  if (!location) {
    return res.status(200).json({ ok: true, slots: [] });
  }

  const slots = getPickupSlots({
    onlineOrderingHoursJson: location.onlineOrderingHoursJson,
    timezone: location.timezone,
    leadTimeMinutes: location.onlineOrderingLeadTimeMinutes,
    leadDays: location.scheduledOrderLeadDays,
    slotMinutes: location.scheduledOrderSlotMinutes
  });

  return res.status(200).json({ ok: true, slots });
}
