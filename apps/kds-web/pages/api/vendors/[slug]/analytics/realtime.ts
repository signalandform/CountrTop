import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';
import { requireKDSSession } from '../../../../../lib/auth';
import type { GetServerSidePropsContext } from 'next';

type QueueHealth = {
  activeTickets: number;
  heldTickets: number;
  avgWaitMinutes: number | null;
  oldestTicketMinutes: number | null;
  status: 'healthy' | 'busy' | 'overloaded';
};

type ItemCount = {
  name: string;
  count: number;
};

type HourlyData = {
  hour: number;
  count: number;
  avgPrepTime: number | null;
};

type TodayStats = {
  completed: number;
  avgPrepTime: number | null;
  peakHour: number | null;
  peakCount: number;
};

type RealtimeAnalyticsResponse =
  | {
      ok: true;
      queueHealth: QueueHealth;
      itemCounts: ItemCount[];
      hourlyData: HourlyData[];
      todayStats: TodayStats;
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RealtimeAnalyticsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : null;
  const locationIdParam = typeof req.query.locationId === 'string' ? req.query.locationId : null;

  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Vendor slug required' });
  }

  try {
    // Create a mock context for requireKDSSession
    const mockContext = {
      req,
      res,
      query: req.query,
      params: { slug }
    } as unknown as GetServerSidePropsContext;

    const authResult = await requireKDSSession(mockContext, slug, locationIdParam);
    if (!authResult.authorized) {
      return res.status(authResult.statusCode || 401).json({
        ok: false,
        error: authResult.error || 'Unauthorized'
      });
    }

    const locationId = locationIdParam || authResult.session.locationId;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Get active tickets for queue health
    const { data: activeTickets } = await supabase
      .from('kitchen_tickets')
      .select('id, placed_at, held_at, status, square_order_id')
      .eq('location_id', locationId)
      .in('status', ['placed', 'preparing', 'ready'])
      .order('placed_at', { ascending: true });

    const tickets = activeTickets || [];
    const heldCount = tickets.filter(t => t.held_at).length;
    const nonHeldTickets = tickets.filter(t => !t.held_at);
    
    // Calculate wait times
    const waitTimes = nonHeldTickets.map(t => {
      return (now.getTime() - new Date(t.placed_at).getTime()) / (1000 * 60);
    });
    
    const avgWaitMinutes = waitTimes.length > 0
      ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
      : null;
    
    const oldestTicketMinutes = waitTimes.length > 0
      ? Math.max(...waitTimes)
      : null;

    // Determine health status
    let status: QueueHealth['status'] = 'healthy';
    if (nonHeldTickets.length > 15 || (oldestTicketMinutes && oldestTicketMinutes > 15)) {
      status = 'overloaded';
    } else if (nonHeldTickets.length > 8 || (oldestTicketMinutes && oldestTicketMinutes > 10)) {
      status = 'busy';
    }

    const queueHealth: QueueHealth = {
      activeTickets: nonHeldTickets.length,
      heldTickets: heldCount,
      avgWaitMinutes,
      oldestTicketMinutes,
      status
    };

    // 2. Get item counts from active orders
    const orderIds = tickets.map(t => t.square_order_id);
    let itemCounts: ItemCount[] = [];

    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from('square_orders')
        .select('line_items')
        .in('square_order_id', orderIds);

      if (orders) {
        const itemMap = new Map<string, number>();
        
        for (const order of orders) {
          const lineItems = order.line_items as Array<{ name?: string; quantity?: number }> | null;
          if (Array.isArray(lineItems)) {
            for (const item of lineItems) {
              const name = item.name || 'Unknown Item';
              const qty = item.quantity || 1;
              itemMap.set(name, (itemMap.get(name) || 0) + qty);
            }
          }
        }

        itemCounts = Array.from(itemMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
      }
    }

    // 3. Get hourly breakdown for today
    const { data: todayTickets } = await supabase
      .from('kitchen_tickets')
      .select('placed_at, ready_at, status')
      .eq('location_id', locationId)
      .gte('placed_at', todayStart.toISOString());

    const hourlyMap = new Map<number, { count: number; prepTimes: number[] }>();
    
    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { count: 0, prepTimes: [] });
    }

    if (todayTickets) {
      for (const ticket of todayTickets) {
        const placedAt = new Date(ticket.placed_at);
        const hour = placedAt.getHours();
        const hourData = hourlyMap.get(hour)!;
        hourData.count++;
        
        if (ticket.ready_at) {
          const readyAt = new Date(ticket.ready_at);
          const prepTime = (readyAt.getTime() - placedAt.getTime()) / (1000 * 60);
          hourData.prepTimes.push(prepTime);
        }
      }
    }

    const hourlyData: HourlyData[] = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
      hour,
      count: data.count,
      avgPrepTime: data.prepTimes.length > 0
        ? data.prepTimes.reduce((a, b) => a + b, 0) / data.prepTimes.length
        : null
    }));

    // 4. Calculate today's stats
    const completedTickets = todayTickets?.filter(t => 
      t.status === 'completed' && t.ready_at
    ) || [];

    const prepTimes = completedTickets
      .filter(t => t.ready_at)
      .map(t => {
        const placed = new Date(t.placed_at).getTime();
        const ready = new Date(t.ready_at!).getTime();
        return (ready - placed) / (1000 * 60);
      });

    const avgPrepTime = prepTimes.length > 0
      ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length
      : null;

    // Find peak hour
    let peakHour: number | null = null;
    let peakCount = 0;
    for (const [hour, data] of hourlyMap.entries()) {
      if (data.count > peakCount) {
        peakCount = data.count;
        peakHour = hour;
      }
    }

    const todayStats: TodayStats = {
      completed: completedTickets.length,
      avgPrepTime,
      peakHour,
      peakCount
    };

    return res.status(200).json({
      ok: true,
      queueHealth,
      itemCounts,
      hourlyData,
      todayStats
    });

  } catch (error) {
    console.error('Error fetching realtime analytics:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

