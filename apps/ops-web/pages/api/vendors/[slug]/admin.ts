import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@countrtop/data';
import { requireOpsAdminApi } from '../../../../lib/auth';

type SetAdminRequest = {
  admin_email: string;
  admin_password: string;
};

type SetAdminResponse =
  | { success: true }
  | { success: false; error: string };

/**
 * POST /api/vendors/[slug]/admin
 * Set or change vendor admin (ops admin only).
 * Creates Supabase Auth user and sets vendors.admin_user_id.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SetAdminResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authResult = await requireOpsAdminApi(req, res);
  if (!authResult.authorized) {
    return res.status(authResult.statusCode ?? 401).json({
      success: false,
      error: authResult.error ?? 'Unauthorized'
    });
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug : Array.isArray(req.query.slug) ? req.query.slug[0] : undefined;
  if (!slug) {
    return res.status(400).json({ success: false, error: 'Vendor slug is required' });
  }

  const body = req.body as SetAdminRequest;
  const adminEmail = typeof body.admin_email === 'string' ? body.admin_email.trim() : '';
  const adminPassword = typeof body.admin_password === 'string' ? body.admin_password : '';
  if (!adminEmail || adminPassword.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'admin_email and admin_password are required; password must be at least 8 characters'
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ success: false, error: 'Server configuration error' });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  try {
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id')
      .eq('slug', slug)
      .single();

    if (vendorError || !vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        error: `Failed to create admin user: ${authError.message}`
      });
    }

    if (!authData?.user?.id) {
      return res.status(500).json({
        success: false,
        error: 'User was not created'
      });
    }

    const { error: updateError } = await supabase
      .from('vendors')
      .update({ admin_user_id: authData.user.id })
      .eq('id', vendor.id);

    if (updateError) {
      console.error('Error updating vendor admin_user_id:', updateError);
      return res.status(500).json({
        success: false,
        error: `Failed to link admin to vendor: ${updateError.message}`
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected error setting vendor admin:', err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error'
    });
  }
}
