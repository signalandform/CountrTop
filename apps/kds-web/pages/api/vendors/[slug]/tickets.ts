import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import { verifyVendorAdminAccess } from '../../../../lib/auth';
import { createServerClient } from '@supabase/auth-helpers-nextjs';

type TicketsResponse =
  | {
      ok: true;
      locationId: string;
      tickets: Array<{
        ticket: {
          id: string;
          squareOrderId: string;
          locationId: string;
          ctReferenceId?: string | null;
          customerUserId?: string | null;
          source: 'countrtop_online' | 'square_pos';
          status: 'placed' | 'preparing' | 'ready';
          shortcode?: string | null;
          placedAt: string;
          readyAt?: string | null;
          completedAt?: string | null;
          updatedAt: string;
        };
        order: {
          squareOrderId: string;
          locationId: string;
          state: string;
          createdAt: string;
          updatedAt: string;
          referenceId?: string | null;
          metadata?: Record<string, unknown> | null;
          lineItems?: unknown[] | null;
          source: 'countrtop_online' | 'square_pos';
        };
      }>;
    }
  | { ok: false; error: string; statusCode?: number };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TicketsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
  if (!slug) {
    return res.status(400).json({
      ok: false,
      error: 'Vendor slug required'
    });
  }

  try {
    // Get user from session
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
      {
        cookies: {
          get(name: string) {
            return req.cookies[name] ?? undefined;
          },
          set() {
            // No-op for GET requests
          },
          remove() {
            // No-op for GET requests
          }
        }
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized',
        statusCode: 401
      });
    }

    // Verify vendor admin access
    const authResult = await verifyVendorAdminAccess(slug, user.id);
    if (!authResult.authorized) {
      return res.status(authResult.statusCode || 403).json({
        ok: false,
        error: authResult.error || 'Forbidden',
        statusCode: authResult.statusCode || 403
      });
    }

    // Get vendor to find square_location_id
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        ok: false,
        error: 'Server configuration error'
      });
    }
    const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase: supabaseAdmin });
    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor || !vendor.squareLocationId) {
      return res.status(404).json({
        ok: false,
        error: 'Vendor not found or missing Square location ID'
      });
    }

    // Fetch active tickets
    const tickets = await dataClient.listActiveKitchenTickets(vendor.squareLocationId);

    return res.status(200).json({
      ok: true,
      locationId: vendor.squareLocationId,
      tickets: tickets.map(({ ticket, order }) => ({
        ticket: {
          id: ticket.id,
          squareOrderId: ticket.squareOrderId,
          locationId: ticket.locationId,
          ctReferenceId: ticket.ctReferenceId ?? null,
          customerUserId: ticket.customerUserId ?? null,
          source: ticket.source,
          status: ticket.status as 'placed' | 'preparing' | 'ready',
          shortcode: ticket.shortcode ?? null,
          placedAt: ticket.placedAt,
          readyAt: ticket.readyAt ?? null,
          completedAt: ticket.completedAt ?? null,
          updatedAt: ticket.updatedAt
        },
        order: {
          squareOrderId: order.squareOrderId,
          locationId: order.locationId,
          state: order.state,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          referenceId: order.referenceId ?? null,
          metadata: order.metadata ?? null,
          lineItems: order.lineItems ?? null,
          source: order.source
        }
      }))
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({
      ok: false,
      error: errorMessage
    });
  }
}

