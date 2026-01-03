#!/usr/bin/env tsx
/**
 * Script to reset password for admin@sunsetcoffee.com
 * Usage: pnpm tsx scripts/reset-admin-password.ts
 * 
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function resetPassword() {
  try {
    const email = 'admin@sunsetcoffee.com';
    const newPassword = 'sunset333coffee';

    // List users to find the admin user
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing users:', listError);
      process.exit(1);
    }

    const user = usersData.users.find(u => u.email === email);
    
    if (!user) {
      console.error(`User ${email} not found`);
      process.exit(1);
    }

    console.log(`Found user: ${user.email} (ID: ${user.id})`);

    // Update password using Admin API
    const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        password: newPassword,
        email_confirm: true
      }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      process.exit(1);
    }

    console.log('✅ Password reset successfully');
    console.log(`Email: ${email}`);
    console.log(`Password: ${newPassword}`);
    console.log('You can now log in at admin.staging.countrtop.com/login');

  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

resetPassword();

