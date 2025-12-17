import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthorizationError, requireAdminUser, resolveUserFromRequest } from '@countrtop/data';

type AdminStatusResponse =
  | { ok: true; userId: string }
  | { ok: false; error: string; reason: 'unauthorized' | 'forbidden' | 'unknown' };

export default function handler(req: NextApiRequest, res: NextApiResponse<AdminStatusResponse>) {
  const user = resolveUserFromRequest(req);

  try {
    const adminUser = requireAdminUser(user);
    return res.status(200).json({ ok: true, userId: adminUser.id });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return res
        .status(user ? 403 : 401)
        .json({ ok: false, error: error.message, reason: user ? 'forbidden' : 'unauthorized' });
    }

    return res.status(500).json({
      ok: false,
      error: 'Unexpected error while enforcing admin access.',
      reason: 'unknown'
    });
  }
}
