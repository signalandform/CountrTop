import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../lib/auth';

type ListResponse = { success: true; tickets: import('@countrtop/models').SupportTicket[] } | { success: false; error: string };
type CreateBody = { subject?: string; message?: string };
type CreateResponse = { success: true; ticket: import('@countrtop/models').SupportTicket } | { success: false; error: string };

/**
 * GET /api/vendors/[slug]/support-tickets
 * List support tickets for this vendor.
 *
 * POST /api/vendors/[slug]/support-tickets
 * Create a new support ticket.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse | CreateResponse>
) {
  const slugParam = req.query.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  const authResult = await requireVendorAdminApi(req, res, slug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode ?? 401).json({
      success: false,
      error: authResult.error ?? 'Unauthorized'
    });
  }

  const dataClient = getServerDataClient();
  const vendor = await dataClient.getVendorBySlug(slug);
  if (!vendor) {
    return res.status(404).json({ success: false, error: 'Vendor not found' });
  }

  if (req.method === 'GET') {
    try {
      const tickets = await dataClient.listSupportTicketsForVendor(vendor.id);
      return res.status(200).json({ success: true, tickets });
    } catch (e) {
      console.error('List support tickets error:', e);
      return res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Failed to list tickets'
      });
    }
  }

  if (req.method === 'POST') {
    const body = req.body as CreateBody;
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!subject) {
      return res.status(400).json({ success: false, error: 'Subject is required' });
    }
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    try {
      const ticket = await dataClient.createSupportTicket({
        vendorId: vendor.id,
        subject,
        message,
        submittedBy: authResult.userId ?? null
      });
      return res.status(200).json({ success: true, ticket });
    } catch (e) {
      console.error('Create support ticket error:', e);
      return res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : 'Failed to create ticket'
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
