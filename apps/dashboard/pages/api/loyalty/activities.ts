import type { NextApiRequest, NextApiResponse } from 'next';

import { createDataClient, RewardActivityInput } from '@countrtop/data';
import { LoyaltyService } from '@countrtop/functions';

type LoyaltyResponse =
  | { ok: true; balance: number; activityId: string }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<LoyaltyResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.body as RewardActivityInput;
  if (!body?.userId || !body.vendorId || typeof body.points !== 'number' || !body.type) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  const dataClient = createDataClient({ useMockData: true });
  const loyalty = new LoyaltyService(dataClient);

  try {
    const result =
      body.type === 'redeem'
        ? await loyalty.redeemForOrder({
            userId: body.userId,
            vendorId: body.vendorId,
            orderId: body.orderId,
            description: body.description,
            points: Math.abs(body.points)
          })
        : await loyalty.accrueForOrder({
            userId: body.userId,
            vendorId: body.vendorId,
            orderId: body.orderId,
            description: body.description,
            total: body.points,
            punches: 0,
            overridePoints: body.points
          });

    return res.status(200).json({ ok: true, balance: result.balance, activityId: result.activity.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record loyalty activity';
    return res.status(500).json({ ok: false, error: message });
  }
}
