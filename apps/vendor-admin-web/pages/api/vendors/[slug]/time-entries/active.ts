import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../../lib/auth';
import type { TimeEntry } from '@countrtop/models';

type TimeEntryWithName = TimeEntry & { employeeName: string };

type ActiveTimeEntriesResponse =
  | { success: true; data: TimeEntryWithName[] }
  | { success: false; error: string };

/**
 * GET /api/vendors/[slug]/time-entries/active
 * Live status: all currently clocked-in time entries for the vendor
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ActiveTimeEntriesResponse>
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

    const [entries, employees] = await Promise.all([
      dataClient.listActiveTimeEntries(vendor.id),
      dataClient.listEmployees(vendor.id)
    ]);

    const employeeById = new Map(employees.map((e) => [e.id, e.name]));
    const data: TimeEntryWithName[] = entries.map((entry) => ({
      ...entry,
      employeeName: employeeById.get(entry.employeeId) ?? 'Unknown'
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Active time entries error:', error);
    return res.status(500).json({ success: false, error: message });
  }
}
