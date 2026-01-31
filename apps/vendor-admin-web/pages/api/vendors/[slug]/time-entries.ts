import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../lib/auth';
import type { TimeEntry } from '@countrtop/models';

type TimeEntryWithName = TimeEntry & { employeeName: string };

type TimeEntriesResponse =
  | { success: true; data: TimeEntryWithName[] }
  | { success: false; error: string };

/**
 * GET /api/vendors/[slug]/time-entries
 * Timesheet: query params start (ISO date), end (ISO date), optional employeeId
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TimeEntriesResponse>
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

  const startParam = req.query.start;
  const endParam = req.query.end;
  const start = Array.isArray(startParam) ? startParam[0] : startParam;
  const end = Array.isArray(endParam) ? endParam[0] : endParam;

  if (!start || !end) {
    return res.status(400).json({ success: false, error: 'Query params start and end (ISO date) are required' });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return res.status(400).json({ success: false, error: 'Invalid start or end date' });
  }

  const employeeIdParam = req.query.employeeId;
  const employeeId = Array.isArray(employeeIdParam) ? employeeIdParam[0] : employeeIdParam;

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(slug);
    if (!vendor) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const [entries, employees] = await Promise.all([
      dataClient.listTimeEntries(vendor.id, employeeId || null, startDate, endDate),
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
    console.error('Time entries error:', error);
    return res.status(500).json({ success: false, error: message });
  }
}
