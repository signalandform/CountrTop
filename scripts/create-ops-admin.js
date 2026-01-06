#!/usr/bin/env node
/**
 * Script to create an ops admin user
 * Usage: node scripts/create-ops-admin.js <email> [password]
 * 
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 * 
 * Example:
 *   node scripts/create-ops-admin.js jack@signalandformllc.com mypassword123
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const email = process.argv[2];
const password = process.argv[3] || 'changeme123';

if (!email) {
  console.error('Error: Email address is required');
  console.error('Usage: node scripts/create-ops-admin.js <email> [password]');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createOpsAdmin() {
  try {
    console.log(`Creating ops admin user: ${email}`);
    
    // Create user with Admin API
    const { data: user, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        display_name: 'Ops Admin',
        role: 'ops'
      }
    });

    if (createError) {
      // If user already exists, try to update password
      if (createError.message.includes('already registered') || createError.message.includes('already exists')) {
        console.log('User already exists, updating password...');
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existing = existingUsers.users.find(u => u.email === email);
        
        if (existing) {
          const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
            password: password
          });
          
          if (updateError) {
            console.error('Error updating password:', updateError);
            process.exit(1);
          }
          
          console.log('✅ Password updated successfully');
          console.log('User ID:', existing.id);
          console.log('');
          console.log('You can now log in at ops.countrtop.com/login');
          console.log(`Email: ${email}`);
          console.log(`Password: ${password}`);
          return;
        } else {
          console.error('User exists but could not be found');
          process.exit(1);
        }
      } else {
        console.error('Error creating user:', createError);
        process.exit(1);
      }
    } else {
      console.log('✅ User created successfully');
      console.log('User ID:', user.user.id);
      console.log('');
      console.log('You can now log in at ops.countrtop.com/login');
      console.log(`Email: ${email}`);
      console.log(`Password: ${password}`);
      console.log('');
      console.log('⚠️  Make sure to add this email to OPS_ADMIN_EMAILS in your Vercel environment variables!');
    }

  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

createOpsAdmin();

