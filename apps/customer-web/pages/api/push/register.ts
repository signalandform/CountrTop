import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerDataClient } from '../../lib/dataClient';

type RegisterRequest = {
  userId?: string;
  deviceToken?: string;
  platform?: 'ios' | 'android' | 'web';
};

type RegisterResponse = { ok: true; id: string } | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<RegisterResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { userId, deviceToken, platform } = req.body as RegisterRequest;
  if (!userId || !deviceToken || !platform) {
    return res.status(400).json({ ok: false, error: 'userId, deviceToken, and platform are required' });
  }

  try {
    const dataClient = getServerDataClient();
    const device = await dataClient.upsertPushDevice({
      userId,
      deviceToken,
      platform
    });
    return res.status(200).json({ ok: true, id: device.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to register push device';
    return res.status(500).json({ ok: false, error: message });
  }
}
