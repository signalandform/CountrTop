import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import { requireKDSSession } from '../../../../lib/auth';
import type { GetServerSidePropsContext } from 'next';

type CustomerInfo = {
  displayName?: string | null;
  loyaltyPoints?: number | null;
  isLoyaltyMember: boolean;
};

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
        customer?: CustomerInfo;
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
  const locationIdParam = typeof req.query.locationId === 'string' ? req.query.locationId : null;

  if (!slug) {
    return res.status(400).json({
      ok: false,
      error: 'Vendor slug required'
    });
  }

  try {
    // Create a mock context for requireKDSSession
    const mockContext = {
      req: req,
      res: res,
      query: req.query,
      params: { slug }
    } as unknown as GetServerSidePropsContext;

    // Verify KDS session
    const authResult = await requireKDSSession(mockContext, slug, locationIdParam);
    if (!authResult.authorized) {
      return res.status(authResult.statusCode || 401).json({
        ok: false,
        error: authResult.error || 'Unauthorized',
        statusCode: authResult.statusCode || 401
      });
    }

    // Use locationId from session or query param
    const locationId = locationIdParam || authResult.session.locationId;

    // Get data client
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

    // Fetch vendor for loyalty lookups
    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor) {
      return res.status(404).json({
        ok: false,
        error: 'Vendor not found'
      });
    }

    // Fetch active tickets filtered by locationId
    const tickets = await dataClient.listActiveKitchenTickets(locationId);

    // Enrich tickets with customer info for online orders
    const enrichedTickets = await Promise.all(
      tickets.map(async ({ ticket, order }) => {
        let customer: CustomerInfo | undefined;

        // Only enrich CountrTop online orders with customer data
        if (ticket.source === 'countrtop_online' && ticket.customerUserId) {
          try {
            // Fetch loyalty balance for the customer
            const loyaltyPoints = await dataClient.getLoyaltyBalance(vendor.id, ticket.customerUserId);
            
            // Try to get customer display name from order_snapshots via reference
            let displayName: string | null = null;
            if (order.referenceId) {
              const snapshot = await dataClient.getOrderSnapshotBySquareOrderId(vendor.id, ticket.squareOrderId);
              if (snapshot) {
                displayName = snapshot.customerDisplayName ?? snapshot.pickupLabel ?? null;
              }
            }

            customer = {
              displayName,
              loyaltyPoints: loyaltyPoints > 0 ? loyaltyPoints : null,
              isLoyaltyMember: loyaltyPoints > 0
            };
          } catch (err) {
            // Log but don't fail - customer info is not critical
            console.warn(`Failed to fetch customer info for ticket ${ticket.id}:`, err);
          }
        }

        return {
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
          },
          customer
        };
      })
    );

    return res.status(200).json({
      ok: true,
      locationId,
      tickets: enrichedTickets
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({
      ok: false,
      error: errorMessage
    });
  }
}

