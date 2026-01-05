import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createDataClient, type Database } from '@countrtop/data';
import { requireKDSSession } from '../../../../../lib/auth';
import type { GetServerSidePropsContext } from 'next';

type StatsResponse =
  | {
      ok: true;
      data: {
        avgPrepTimeMinutes: number | null;
        ticketCount: number;
      };
    }
  | { ok: false; error: string; statusCode?: number };

/**
 * GET /api/vendors/[slug]/tickets/stats
 * 
 * Returns daily average prep time for today's completed tickets.
 * Query params: locationId (required)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatsResponse>
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

  if (!locationIdParam) {
    return res.status(400).json({
      ok: false,
      error: 'locationId query parameter required'
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
    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    const dataClient = createDataClient({ supabase });

    // Get today's date range (start of day to now, in UTC)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = now;

    // Fetch today's completed tickets
    const { data: tickets, error } = await supabase
      .from('kitchen_tickets')
      .select('placed_at, ready_at')
      .eq('location_id', locationId)
      .gte('placed_at', todayStart.toISOString())
      .lte('placed_at', todayEnd.toISOString())
      .not('ready_at', 'is', null);

    if (error) {
      console.error('Error fetching tickets:', error);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch ticket stats'
      });
    }

    const ticketsData = tickets || [];
    const completedTickets = ticketsData.filter(t => t.ready_at && t.placed_at);

    if (completedTickets.length === 0) {
      return res.status(200).json({
        ok: true,
        data: {
          avgPrepTimeMinutes: null,
          ticketCount: 0
        }
      });
    }

    // Calculate average prep time
    const totalPrepTime = completedTickets.reduce((sum, t) => {
      const placed = new Date(t.placed_at).getTime();
      const ready = new Date(t.ready_at!).getTime();
      return sum + (ready - placed) / (1000 * 60); // Convert to minutes
    }, 0);

    const avgPrepTimeMinutes = totalPrepTime / completedTickets.length;

    return res.status(200).json({
      ok: true,
      data: {
        avgPrepTimeMinutes,
        ticketCount: completedTickets.length
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({
      ok: false,
      error: errorMessage
    });
  }
}

