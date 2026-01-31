import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../lib/dataClient';
import { requireOpsAdminApi } from '../../../lib/auth';
import type { SupportTicketStatus } from '@countrtop/models';

type TicketWithVendor = import('@countrtop/models').SupportTicket & { vendorName?: string; vendorSlug?: string };

type GetResponse =
  | { success: true; ticket: TicketWithVendor }
  | { success: false; error: string };

type PatchBody = { status?: SupportTicketStatus; opsReply?: string };
type PatchResponse =
  | { success: true; ticket: import('@countrtop/models').SupportTicket }
  | { success: false; error: string };

/**
 * GET /api/support-tickets/[id]
 * Get one support ticket (ops). Enriches with vendor displayName, slug.
 *
 * PATCH /api/support-tickets/[id]
 * Update ticket status and/or ops reply. Sets ops_replied_at when opsReply is provided.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponse | PatchResponse>
) {
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, error: 'Ticket id is required' });
  }

  const authResult = await requireOpsAdminApi(req, res);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode ?? 401).json({
      success: false,
      error: authResult.error ?? 'Unauthorized'
    });
  }

  const dataClient = getServerDataClient();

  if (req.method === 'GET') {
    try {
      const ticket = await dataClient.getSupportTicket(id);
      if (!ticket) {
        return res.status(404).json({ success: false, error: 'Ticket not found' });
      }
      const vendor = await dataClient.getVendorById(ticket.vendorId);
      const enriched: TicketWithVendor = {
        ...ticket,
        vendorName: vendor?.displayName ?? 'Unknown',
        vendorSlug: vendor?.slug
      };
      return res.status(200).json({ success: true, ticket: enriched });
    } catch (e) {
      console.error('Get support ticket error:', e);
      return res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Failed to get ticket'
      });
    }
  }

  if (req.method === 'PATCH') {
    const body = req.body as PatchBody;
    const status =
      body?.status === 'open' || body?.status === 'in_progress' || body?.status === 'closed'
        ? body.status
        : undefined;
    const opsReply = typeof body?.opsReply === 'string' ? body.opsReply : undefined;

    if (status === undefined && opsReply === undefined) {
      return res.status(400).json({ success: false, error: 'Provide status and/or opsReply' });
    }

    try {
      const ticket = await dataClient.updateSupportTicket(id, { status, opsReply });
      return res.status(200).json({ success: true, ticket });
    } catch (e) {
      console.error('Update support ticket error:', e);
      return res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Failed to update ticket'
      });
    }
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
