import type { NextApiRequest, NextApiResponse } from 'next';

import { createLogger } from '@countrtop/api-client';
import { getServerDataClient } from '../../../lib/dataClient';
import { processSquareWebhookEvent } from '../../../lib/squareWebhookProcessor';

const logger = createLogger({ requestId: 'process-webhooks' });

const BACKOFF_SECONDS = [5, 30, 120, 600, 3600]; // 5s, 30s, 2m, 10m, 1h
const CLAIM_LIMIT = 20;

type ProcessResponse = {
  ok: boolean;
  claimed: number;
  done: number;
  failed: number;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProcessResponse>
) {
  // Vercel Cron sends GET; also allow POST for manual triggers
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, claimed: 0, done: 0, failed: 0, error: 'Method not allowed' });
  }

  // Vercel Cron sends X-Vercel-Authorization; also support Authorization, query, body for manual triggers
  const vercelAuthHeader = req.headers['x-vercel-authorization'];
  const authHeader = req.headers['authorization'];
  const secret = vercelAuthHeader ||
    authHeader?.replace(/^Bearer\s+/i, '') ||
    (req.query?.secret as string) ||
    (req.body?.secret as string);
  const expectedSecret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET;

  if (expectedSecret && (!secret || secret !== expectedSecret)) {
    logger.warn('Unauthorized process-webhooks request');
    return res.status(401).json({ ok: false, claimed: 0, done: 0, failed: 0, error: 'Unauthorized' });
  }

  const dataClient = getServerDataClient();
  const lockedBy = `worker-${Date.now()}`;

  const resetCount = await dataClient.resetStaleWebhookJobs();
  if (resetCount > 0) {
    logger.info('Reset stale webhook jobs to queued', { count: resetCount });
  }

  const jobs = await dataClient.claimWebhookJobsRPC({
    provider: 'square',
    limit: CLAIM_LIMIT,
    lockedBy
  });

  let done = 0;
  let failed = 0;

  for (const job of jobs) {
    const { id: jobId, eventId, webhookEventId, attempts } = job;
    let orderId: string | undefined;
    let vendorId: string | undefined;

    try {
      const webhookEvent = await dataClient.getWebhookEventById(webhookEventId);
      if (!webhookEvent) {
        logger.error('Webhook event not found', undefined, { jobId, webhookEventId });
        await dataClient.markWebhookJobFailed(jobId, 'Webhook event not found', 0);
        failed++;
        continue;
      }

      const payload = webhookEvent.payload as Record<string, unknown>;
      const eventType = (payload?.type as string) ?? 'unknown';
      if (eventType === 'order.updated' || eventType === 'order.created') {
        const dataObj = payload?.data as Record<string, unknown> | undefined;
        const objData = dataObj?.object as Record<string, unknown> | undefined;
        const orderUpdated = objData?.order_updated as Record<string, unknown> | undefined;
        const orderCreated = objData?.order_created as Record<string, unknown> | undefined;
        const orderData = orderUpdated ?? orderCreated;
        const orderObj = orderData?.order as Record<string, unknown> | undefined;
        orderId = (orderData?.order_id ?? orderObj?.id) as string | undefined;
        const locationId = (orderObj?.location_id ?? orderData?.location_id) as string | undefined;
        if (locationId) {
          const vendor = await dataClient.getVendorBySquareLocationId(locationId);
          vendorId = vendor?.id;
        }
      } else if (eventType === 'payment.updated') {
        const dataObj = payload?.data as Record<string, unknown> | undefined;
        const objData = dataObj?.object as Record<string, unknown> | undefined;
        const payment = (objData?.payment as Record<string, unknown>) ?? objData;
        orderId = (payment?.orderId ?? payment?.order_id) as string | undefined;
        const locationId = (payment?.locationId ?? payment?.location_id) as string | undefined;
        if (locationId) {
          const vendor = await dataClient.getVendorBySquareLocationId(locationId);
          vendorId = vendor?.id;
        }
      }

      logger.info('Processing webhook job', { jobId, eventId, orderId, vendorId });

      await processSquareWebhookEvent(webhookEvent, dataClient);

      await dataClient.markWebhookJobDone(jobId);
      await dataClient.updateWebhookEventStatus(webhookEventId, {
        status: 'processed',
        processedAt: new Date().toISOString()
      });

      done++;
      logger.info('Webhook job completed', { jobId, eventId, orderId, vendorId });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const backoffIndex = Math.min(attempts - 1, BACKOFF_SECONDS.length - 1);
      const backoffSeconds = backoffIndex >= 0 ? BACKOFF_SECONDS[backoffIndex] : BACKOFF_SECONDS[0];

      logger.error('Webhook job failed', error instanceof Error ? error : new Error(errMsg), {
        jobId,
        eventId,
        orderId,
        vendorId,
        attempts
      });

      await dataClient.markWebhookJobFailed(jobId, errMsg, backoffSeconds);
      await dataClient.updateWebhookEventStatus(webhookEventId, {
        status: 'failed',
        error: errMsg
      });

      failed++;
    }
  }

  return res.status(200).json({
    ok: true,
    claimed: jobs.length,
    done,
    failed
  });
}
