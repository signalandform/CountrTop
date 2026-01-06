import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerDataClient } from '../../../../lib/dataClient';
import { requireVendorAdminApi } from '../../../../lib/auth';

type EmployeesResponse =
  | { success: true; data: Array<{ id: string; name: string; pin: string; isActive: boolean }> }
  | { success: false; error: string };

type CreateEmployeeRequest = {
  name: string;
  pin: string;
};

type CreateEmployeeResponse =
  | { success: true; employee: { id: string; name: string; pin: string } }
  | { success: false; error: string };

type UpdateEmployeeRequest = {
  name?: string;
  pin?: string;
  isActive?: boolean;
};

type UpdateEmployeeResponse =
  | { success: true }
  | { success: false; error: string };

/**
 * GET /api/vendors/[slug]/employees
 * List all employees for a vendor
 * 
 * POST /api/vendors/[slug]/employees
 * Create a new employee
 * 
 * PUT /api/vendors/[slug]/employees/[employeeId]
 * Update an employee
 * 
 * DELETE /api/vendors/[slug]/employees/[employeeId]
 * Delete an employee
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EmployeesResponse | CreateEmployeeResponse | UpdateEmployeeResponse>
) {
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

    if (req.method === 'GET') {
      // List employees
      const employees = await dataClient.listEmployees(vendor.id);
      return res.status(200).json({
        success: true,
        data: employees.map(emp => ({
          id: emp.id,
          name: emp.name,
          pin: emp.pin,
          isActive: emp.isActive
        }))
      });
    } else if (req.method === 'POST') {
      // Create employee
      const { name, pin }: CreateEmployeeRequest = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Name is required' });
      }

      if (!pin || typeof pin !== 'string' || !/^\d{3}$/.test(pin)) {
        return res.status(400).json({ success: false, error: 'PIN must be exactly 3 digits' });
      }

      const employee = await dataClient.createEmployee(vendor.id, name.trim(), pin);
      return res.status(201).json({
        success: true,
        employee: {
          id: employee.id,
          name: employee.name,
          pin: employee.pin
        }
      });
    } else if (req.method === 'PUT') {
      // Update employee
      const employeeIdParam = req.query.employeeId;
      const employeeId = Array.isArray(employeeIdParam) ? employeeIdParam[0] : employeeIdParam;

      if (!employeeId || typeof employeeId !== 'string') {
        return res.status(400).json({ success: false, error: 'Employee ID is required' });
      }

      const updates: UpdateEmployeeRequest = req.body;
      await dataClient.updateEmployee(employeeId, updates);
      return res.status(200).json({ success: true });
    } else if (req.method === 'DELETE') {
      // Delete employee
      const employeeIdParam = req.query.employeeId;
      const employeeId = Array.isArray(employeeIdParam) ? employeeIdParam[0] : employeeIdParam;

      if (!employeeId || typeof employeeId !== 'string') {
        return res.status(400).json({ success: false, error: 'Employee ID is required' });
      }

      await dataClient.deleteEmployee(employeeId);
      return res.status(200).json({ success: true });
    } else {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Employee management error:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to manage employees: ${errorMessage}`
    });
  }
}

