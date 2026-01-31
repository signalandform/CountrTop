import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../lib/dataClient';
import { requireOpsAdminApi } from '../../lib/auth';

type TicketWithVendor = import('@countrtop/models').SupportTicket & { vendorName?: string; vendorSlug?: string };

type ListResponse =
  | { success: true; tickets: TicketWithVendor[] }
  | { success: false; error: string };

/**
 * GET /api/support-tickets
 * List support tickets (ops). Optional query: vendorId, status.
 * Enriches each ticket with vendorName (and vendorSlug for links).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<ListResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authResult = await requireOpsAdminApi(req, res);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode ?? 401).json({
      success: false,
      error: authResult.error ?? 'Unauthorized'
    });
  }

  try {
    const dataClient = getServerDataClient();
    const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const tickets = await dataClient.listSupportTickets({ vendorId, status });

    const vendorIds = [...new Set(tickets.map((t) => t.vendorId))];
    const vendorMap = new Map<string, { displayName: string; slug: string }>();
    for (const vid of vendorIds) {
      const vendor = await dataClient.getVendorById(vid);
      if (vendor) vendorMap.set(vid, { displayName: vendor.displayName, slug: vendor.slug });
    }

    const enriched: TicketWithVendor[] = tickets.map((t) => {
      const v = vendorMap.get(t.vendorId);
      return {
        ...t,
        vendorName: v?.displayName ?? 'Unknown',
        vendorSlug: v?.slug
      };
    });

    return res.status(200).json({ success: true, tickets: enriched });
  } catch (e) {
    console.error('List support tickets error:', e);
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Failed to list tickets'
    });
  }
}
