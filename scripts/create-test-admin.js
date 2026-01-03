#!/usr/bin/env node
/**
 * Script to create a test vendor admin user for sunset
 * Usage: node scripts/create-test-admin.js
 * 
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

const { createClient } = require('@supabase/supabase-js');

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

async function createTestAdmin() {
  try {
    // Create user with Admin API
    const { data: user, error: createError } = await supabase.auth.admin.createUser({
      email: 'admin@sunsetcoffee.com',
      password: 'sunset333coffee',
      email_confirm: true,
      user_metadata: {
        display_name: 'Sunset Test Admin'
      }
    });

    if (createError) {
      // If user already exists, try to update password
      if (createError.message.includes('already registered')) {
        console.log('User already exists, updating password...');
        const { data: existingUser } = await supabase.auth.admin.listUsers();
        const existing = existingUser.users.find(u => u.email === 'admin@sunsetcoffee.com');
        
        if (existing) {
          const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
            password: 'sunset333coffee'
          });
          
          if (updateError) {
            console.error('Error updating password:', updateError);
            process.exit(1);
          }
          
          console.log('Password updated successfully');
          console.log('User ID:', existing.id);
        }
      } else {
        console.error('Error creating user:', createError);
        process.exit(1);
      }
    } else {
      console.log('User created successfully');
      console.log('User ID:', user.user.id);
    }

    // Link user to sunset vendor
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id')
      .eq('slug', 'sunset')
      .single();

    if (vendorError || !vendor) {
      console.error('Error finding sunset vendor:', vendorError);
      process.exit(1);
    }

    const userId = user?.user?.id || existing?.id;
    if (!userId) {
      console.error('Could not determine user ID');
      process.exit(1);
    }

    const { error: updateError } = await supabase
      .from('vendors')
      .update({ admin_user_id: userId })
      .eq('slug', 'sunset');

    if (updateError) {
      console.error('Error linking user to vendor:', updateError);
      process.exit(1);
    }

    console.log('✅ Test admin user created and linked to sunset vendor');
    console.log('Email: admin@sunsetcoffee.com');
    console.log('Password: sunset333coffee');
    console.log('You can now log in at admin.staging.countrtop.com/login');

  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

createTestAdmin();

