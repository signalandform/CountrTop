/**
 * Replay a Square webhook event by re-enqueueing its job.
 *
 * Usage:
 *   pnpm tsx scripts/replay-webhook-event.ts --eventId <Square event_id>
 *   pnpm tsx scripts/replay-webhook-event.ts --webhookEventId <webhook_events.id uuid>
 *
 * Then either:
 *   - Wait for the next cron run (every minute), or
 *   - Manually trigger: curl -X POST https://yourdomain.com/api/jobs/process-webhooks \
 *       -H "Authorization: Bearer $CRON_SECRET"
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const eventId = process.argv.find((a) => a.startsWith('--eventId='))?.split('=')[1];
const webhookEventId = process.argv.find((a) => a.startsWith('--webhookEventId='))?.split('=')[1];

if (!eventId && !webhookEventId) {
  console.error('Usage: pnpm tsx scripts/replay-webhook-event.ts --eventId=<id> | --webhookEventId=<uuid>');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function main() {
  let ev: { id: string; event_id: string } | null = null;
  if (webhookEventId) {
    const { data, error } = await supabase
      .from('webhook_events')
      .select('id, event_id')
      .eq('id', webhookEventId)
      .single();
    if (error || !data) {
      console.error('Webhook event not found:', webhookEventId, error?.message);
      process.exit(1);
    }
    ev = data as { id: string; event_id: string };
  } else {
    const { data, error } = await supabase
      .from('webhook_events')
      .select('id, event_id')
      .eq('provider', 'square')
      .eq('event_id', eventId!)
      .single();
    if (error || !data) {
      console.error('Webhook event not found for event_id:', eventId, error?.message);
      process.exit(1);
    }
    ev = data as { id: string; event_id: string };
  }

  const weId = ev.id;
  const evId = ev.event_id;

  const { data: job, error } = await supabase
    .from('webhook_jobs')
    .upsert(
      {
        provider: 'square',
        event_id: evId,
        webhook_event_id: weId,
        status: 'queued',
        run_after: new Date().toISOString(),
        attempts: 0,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'provider,event_id' }
    )
    .select('id')
    .single();

  if (error) {
    console.error('Failed to enqueue job:', error.message);
    process.exit(1);
  }
  console.log('Re-enqueued webhook job:', (job as { id: string }).id, 'for event_id:', evId, 'webhook_event_id:', weId);
  console.log('Wait for cron or trigger: curl -X POST <BASE_URL>/api/jobs/process-webhooks -H "Authorization: Bearer $CRON_SECRET"');
}

main();
