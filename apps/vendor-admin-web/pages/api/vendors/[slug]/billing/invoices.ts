import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';

type InvoiceItem = {
  id: string;
  amountPaid: number;
  status: string;
  pdfUrl: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
};

type InvoicesGetResponse =
  | { success: true; data: InvoiceItem[] }
  | { success: false; error: string };

/**
 * GET /api/vendors/[slug]/billing/invoices
 * Lists Stripe invoices for the vendor's customer (paid subscriptions).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<InvoicesGetResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

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

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ success: false, error: 'Billing is not configured' });
  }

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const billing = await dataClient.getVendorBilling(vendor.id);
    const customerId = billing?.stripeCustomerId ?? null;

    if (!customerId) {
      return res.status(200).json({ success: true, data: [] });
    }

    const stripe = new Stripe(secretKey);
    const list = await stripe.invoices.list({
      customer: customerId,
      limit: 24
    });

    const data: InvoiceItem[] = (list.data ?? []).map((inv) => ({
      id: inv.id,
      amountPaid: inv.amount_paid ?? 0,
      status: inv.status ?? 'unknown',
      pdfUrl: inv.invoice_pdf ?? null,
      periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : '',
      periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : '',
      createdAt: inv.created ? new Date(inv.created * 1000).toISOString() : ''
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Invoices GET error:', error);
    return res.status(500).json({ success: false, error: `Failed to list invoices: ${message}` });
  }
}
