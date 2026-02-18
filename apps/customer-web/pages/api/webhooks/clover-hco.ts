/**
 * Clover Hosted Checkout webhook endpoint.
 * Configure this URL in the Clover Merchant Dashboard > Ecommerce > Hosted Checkout > Webhook URL.
 * Payload: Payment status (Approved/Declined), MerchantId, Data = Checkout Session UUID.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

import { createLogger } from '@countrtop/api-client';
import { getServerDataClient } from '../../../lib/dataClient';
import {
  verifyCloverHcoSignature,
  processCloverHcoPaymentApproved,
  type CloverHcoWebhookPayload
} from '../../../lib/cloverHcoWebhookProcessor';

const logger = createLogger({ requestId: 'clover-hco-webhook' });

export const config = {
  api: {
    bodyParser: false
  }
};

const bufferRequest = (req: NextApiRequest): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });

type HcoResponse = {
  ok: boolean;
  status: 'processed' | 'ignored' | 'invalid';
  reason?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HcoResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, status: 'invalid', reason: 'Method not allowed' });
  }

  const rawBody = await bufferRequest(req);

  let payload: CloverHcoWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as CloverHcoWebhookPayload;
  } catch {
    return res.status(400).json({ ok: false, status: 'invalid', reason: 'Invalid JSON' });
  }

  const signingSecret = process.env.CLOVER_HCO_WEBHOOK_SIGNING_SECRET;
  const signature = req.headers['x-clover-signature'] as string | undefined;
  if (signingSecret && signature) {
    const valid = verifyCloverHcoSignature(rawBody, signature, signingSecret);
    if (!valid) {
      logger.warn('Clover HCO webhook signature validation failed');
      return res.status(401).json({ ok: false, status: 'invalid', reason: 'Invalid signature' });
    }
  } else if (process.env.NODE_ENV === 'production' && !signingSecret) {
    logger.warn('Clover HCO webhook signing secret not configured');
  }

  const status = payload.Status?.toUpperCase();
  const sessionId = payload.Data;
  const merchantId = payload.MerchantId;
  const paymentId = payload.Id;

  // Clover sends a verification code when configuring the webhook URL; log it so you can paste into the Dashboard
  const verificationCode = (payload as { verificationCode?: string }).verificationCode;
  if (verificationCode) {
    logger.info('Clover HCO webhook verification code (paste into Clover Dashboard)', { verificationCode });
    return res.status(200).json({ ok: true, status: 'ignored', reason: 'Verification' });
  }

  if (!sessionId || !merchantId) {
    return res.status(200).json({ ok: true, status: 'ignored', reason: 'Missing Data or MerchantId' });
  }

  if (status !== 'APPROVED') {
    logger.info('Clover HCO webhook: payment not approved', { status, sessionId });
    return res.status(200).json({ ok: true, status: 'ignored', reason: 'Payment not approved' });
  }

  try {
    const dataClient = getServerDataClient();
    await processCloverHcoPaymentApproved(sessionId, merchantId, paymentId, dataClient);
    return res.status(200).json({ ok: true, status: 'processed' });
  } catch (error) {
    logger.error('Clover HCO webhook processing failed', error instanceof Error ? error : new Error(String(error)), {
      sessionId,
      merchantId
    });
    return res.status(500).json({
      ok: false,
      status: 'invalid',
      reason: error instanceof Error ? error.message : 'Processing failed'
    });
  }
}
