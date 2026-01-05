import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';

type RevenueSeriesResponse =
  | { success: true; data: import('@countrtop/models').RevenuePoint[] }
  | { success: false; error: string };

/**
 * GET /api/vendors/[slug]/analytics/revenue-series
 * 
 * Query Parameters:
 *   - startDate (ISO 8601, required)
 *   - endDate (ISO 8601, required)
 *   - granularity ('hour' | 'day' | 'week' | 'month', optional, default: 'day')
 *   - timezone (IANA timezone, optional - inferred from vendor if not provided)
 * 
 * Returns revenue time series data.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RevenueSeriesResponse>
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
    const granularityParam = req.query.granularity;
    const timezoneParam = req.query.timezone;

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

    // Validate granularity
    const granularity = (typeof granularityParam === 'string' &&
      (granularityParam === 'hour' || granularityParam === 'day' || granularityParam === 'week' || granularityParam === 'month'))
      ? granularityParam
      : 'day';

    // Use provided timezone or vendor's timezone, default to UTC
    const timezone = (typeof timezoneParam === 'string' && timezoneParam)
      || vendor.timezone
      || 'UTC';

    // Get revenue series
    const revenueSeries = await dataClient.getRevenueSeries(
      vendor.squareLocationId,
      startDate,
      endDate,
      granularity,
      timezone
    );

    return res.status(200).json({
      success: true,
      data: revenueSeries
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching revenue series:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch revenue series: ${errorMessage}`
    });
  }
}

