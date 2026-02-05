/**
 * @deprecated Use /api/webhooks/square instead
 * This endpoint is maintained for backward compatibility.
 * Forwards to the unified fast-ack handler (persist + enqueue, no sync processing).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { handleSquareWebhook } from '../webhooks/[provider]';

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, status: 'invalid', reason: 'Method not allowed' });
  }

  const rawBody = await bufferRequest(req);
  const { response, statusCode } = await handleSquareWebhook(req, rawBody);
  return res.status(statusCode).json(response);
}
