#!/usr/bin/env tsx
/**
 * Trace a Square order through CountrTop: webhook, job, ticket, snapshot.
 *
 * Usage:
 *   pnpm tsx scripts/trace-square-order.ts --orderId=<Square order ID>
 *
 * Example:
 *   pnpm tsx scripts/trace-square-order.ts --orderId=abc123xyz
 *
 * Environment variables required:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const orderIdArg = process.argv.find((a) => a.startsWith('--orderId='))?.split('=')[1];
if (!orderIdArg?.trim()) {
  console.error('Usage: pnpm tsx scripts/trace-square-order.ts --orderId=<Square order ID>');
  process.exit(1);
}
const squareOrderId = orderIdArg.trim();

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

function extractOrderIdFromPayload(payload: Record<string, unknown>): string | null {
  try {
    const data = payload?.data as Record<string, unknown> | undefined;
    const obj = data?.object as Record<string, unknown> | undefined;
    if (!obj) return null;
    const orderUpdated = obj.order_updated as Record<string, unknown> | undefined;
    const orderCreated = obj.order_created as Record<string, unknown> | undefined;
    const orderData = orderUpdated ?? orderCreated;
    if (orderData) {
      const id = (orderData.order_id ?? (orderData.order as Record<string, unknown>)?.id) as string | undefined;
      return id ?? null;
    }
    const payment = (obj.payment ?? obj) as Record<string, unknown> | undefined;
    if (payment) {
      return (payment.orderId ?? payment.order_id) as string | null ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

async function main() {
  console.log('\nTrace Square order:', squareOrderId);
  console.log('─'.repeat(60));

  const result: {
    webhookEvents: Array<{ id: string; eventId: string; eventType: string; status: string; receivedAt: string; error?: string }>;
    webhookJobs: Array<{ id: string; eventId: string; status: string; attempts: number; lastError?: string; lockedAt?: string }>;
    kitchenTicket: { id: string; status: string; placedAt: string } | null;
    orderSnapshot: { id: string; placedAt: string } | null;
  } = {
    webhookEvents: [],
    webhookJobs: [],
    kitchenTicket: null,
    orderSnapshot: null
  };

  // 1. Kitchen ticket (direct lookup)
  const { data: ticketRow } = await supabase
    .from('kitchen_tickets')
    .select('id, status, placed_at')
    .eq('square_order_id', squareOrderId)
    .maybeSingle();
  if (ticketRow) {
    result.kitchenTicket = {
      id: ticketRow.id,
      status: ticketRow.status,
      placedAt: ticketRow.placed_at ?? ''
    };
  }

  // 2. Order snapshot (direct lookup)
  const { data: snapshotRow } = await supabase
    .from('order_snapshots')
    .select('id, placed_at')
    .eq('square_order_id', squareOrderId)
    .maybeSingle();
  if (snapshotRow) {
    result.orderSnapshot = {
      id: snapshotRow.id,
      placedAt: snapshotRow.placed_at ?? ''
    };
  }

  // 3. Webhook events (payload contains order_id) - fetch recent and filter
  const { data: events } = await supabase
    .from('webhook_events')
    .select('id, event_id, event_type, status, received_at, error, payload')
    .eq('provider', 'square')
    .order('received_at', { ascending: false })
    .limit(500);
  const matchingEvents = (events ?? []).filter((ev) => {
    const payload = ev.payload as Record<string, unknown>;
    const extracted = extractOrderIdFromPayload(payload);
    return extracted === squareOrderId;
  });
  result.webhookEvents = matchingEvents.map((ev) => ({
    id: ev.id,
    eventId: ev.event_id,
    eventType: ev.event_type ?? 'unknown',
    status: ev.status ?? 'unknown',
    receivedAt: ev.received_at ?? '',
    error: ev.error ?? undefined
  }));

  // 4. Webhook jobs for matching event_ids
  const eventIds = matchingEvents.map((e) => e.event_id);
  if (eventIds.length > 0) {
    const { data: jobs } = await supabase
      .from('webhook_jobs')
      .select('id, event_id, status, attempts, last_error, locked_at')
      .eq('provider', 'square')
      .in('event_id', eventIds);
    result.webhookJobs = (jobs ?? []).map((j) => ({
      id: j.id,
      eventId: j.event_id,
      status: j.status,
      attempts: j.attempts ?? 0,
      lastError: j.last_error ?? undefined,
      lockedAt: j.locked_at ?? undefined
    }));
  }

  // Output
  console.log('\nWebhook events:', result.webhookEvents.length);
  result.webhookEvents.forEach((e) => {
    console.log(`  - ${e.eventType} | event_id=${e.eventId} | status=${e.status} | received=${e.receivedAt}`);
    if (e.error) console.log(`    error: ${e.error}`);
  });

  console.log('\nWebhook jobs:', result.webhookJobs.length);
  result.webhookJobs.forEach((j) => {
    console.log(`  - job=${j.id} | event_id=${j.eventId} | status=${j.status} | attempts=${j.attempts}`);
    if (j.lastError) console.log(`    last_error: ${j.lastError}`);
  });

  console.log('\nKitchen ticket:', result.kitchenTicket ? `${result.kitchenTicket.id} (${result.kitchenTicket.status})` : 'NOT FOUND');
  if (result.kitchenTicket) {
    console.log(`  placed_at: ${result.kitchenTicket.placedAt}`);
  }

  console.log('\nOrder snapshot:', result.orderSnapshot ? result.orderSnapshot.id : 'NOT FOUND');
  if (result.orderSnapshot) {
    console.log(`  placed_at: ${result.orderSnapshot.placedAt}`);
  }

  console.log('\n' + '─'.repeat(60));
  if (result.webhookEvents.length === 0 && !result.kitchenTicket && !result.orderSnapshot) {
    console.log('No data found. Order may not have been received or is older than search window.');
    console.log('To replay if webhook was dropped: find event_id from Square, then:');
    console.log('  pnpm tsx scripts/replay-webhook-event.ts --eventId=<event_id>');
  } else if (result.webhookEvents.length > 0 && result.webhookJobs.some((j) => j.status === 'failed')) {
    console.log('Job(s) failed. To replay: pnpm tsx scripts/replay-webhook-event.ts --eventId=<event_id>');
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
