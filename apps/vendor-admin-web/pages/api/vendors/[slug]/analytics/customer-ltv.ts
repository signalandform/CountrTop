import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';

type CustomerLtvResponse =
  | { success: true; data: import('@countrtop/models').CustomerLtvPoint[] }
  | { success: false; error: string };

/**
 * GET /api/vendors/[slug]/analytics/customer-ltv
 * 
 * Returns customer lifetime value data (all time, CountrTop online orders only).
 * Note: This endpoint only includes CountrTop online orders (excludes POS orders).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CustomerLtvResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const slugParam = req.query.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  // Authenticate as vendor admin
  const authResult = await requireVendorAdminApi(req, res, slug);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode || 401).json({
      success: false,
      error: authResult.error || 'Unauthorized'
    });
  }

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(slug);

    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    // Get customer LTV (CountrTop online orders only, all time)
    const customerLtv = await dataClient.getCustomerLtv(vendor.id);

    return res.status(200).json({
      success: true,
      data: customerLtv
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching customer LTV:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch customer LTV: ${errorMessage}`
    });
  }
}

