import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';

type RevenueBySourceResponse =
  | { success: true; data: import('@countrtop/models').RevenueBySource }
  | { success: false; error: string };

/**
 * GET /api/vendors/[slug]/analytics/revenue-by-source
 * 
 * Query Parameters:
 *   - startDate (ISO 8601, required)
 *   - endDate (ISO 8601, required)
 * 
 * Returns revenue breakdown by source (online vs POS).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RevenueBySourceResponse>
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

    // Parse query parameters
    const startDateStr = req.query.startDate;
    const endDateStr = req.query.endDate;

    if (!startDateStr || typeof startDateStr !== 'string') {
      return res.status(400).json({ success: false, error: 'startDate parameter is required' });
    }
    if (!endDateStr || typeof endDateStr !== 'string') {
      return res.status(400).json({ success: false, error: 'endDate parameter is required' });
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid startDate format' });
    }
    if (isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid endDate format' });
    }

    // Validate date range (max 90 days)
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 90) {
      return res.status(400).json({
        success: false,
        error: 'Date range cannot exceed 90 days. Please select a smaller range.'
      });
    }

    // Get revenue by source
    const revenueBySource = await dataClient.getRevenueBySource(
      vendor.squareLocationId,
      startDate,
      endDate
    );

    return res.status(200).json({
      success: true,
      data: revenueBySource
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching revenue by source:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch revenue by source: ${errorMessage}`
    });
  }
}

