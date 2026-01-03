#!/usr/bin/env tsx
/**
 * Test script for vendor prefill from Square
 * 
 * Usage:
 *   pnpm tsx scripts/test-prefill-vendor.ts sunset
 * 
 * This script tests the Square location fetch and vendor update logic
 * without requiring authentication (uses service role key directly)
 */

import { getSquareLocation } from '@countrtop/api-client';
import { getServerDataClient } from '../apps/vendor-admin-web/lib/dataClient';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@countrtop/data';

async function testPrefillVendor(vendorSlug: string) {
  console.log(`\n🧪 Testing vendor prefill for: ${vendorSlug}\n`);

  try {
    // Get vendor
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(vendorSlug);

    if (!vendor) {
      console.error(`❌ Vendor not found: ${vendorSlug}`);
      process.exit(1);
    }

    console.log(`✅ Found vendor: ${vendor.displayName}`);
    console.log(`   Square Location ID: ${vendor.squareLocationId}`);
    console.log(`   Current address: ${vendor.addressLine1 || '(empty)'}`);

    if (!vendor.squareLocationId) {
      console.error(`❌ Vendor has no square_location_id`);
      process.exit(1);
    }

    // Fetch Square location data
    console.log(`\n📡 Fetching Square location data...`);
    const locationData = await getSquareLocation(vendor, vendor.squareLocationId);

    console.log(`✅ Square location data fetched:`);
    console.log(`   Name: ${locationData.name || '(not provided)'}`);
    console.log(`   Address: ${locationData.addressLine1 || '(not provided)'}`);
    if (locationData.addressLine2) {
      console.log(`            ${locationData.addressLine2}`);
    }
    console.log(`   City: ${locationData.city || '(not provided)'}`);
    console.log(`   State: ${locationData.state || '(not provided)'}`);
    console.log(`   Postal Code: ${locationData.postalCode || '(not provided)'}`);
    console.log(`   Phone: ${locationData.phone || '(not provided)'}`);
    console.log(`   Timezone: ${locationData.timezone || '(not provided)'}`);

    // Prepare update
    const updateData: Partial<Database['public']['Tables']['vendors']['Update']> = {};
    const updated: string[] = [];
    const skipped: string[] = [];

    if (locationData.name && !vendor.displayName) {
      updateData.display_name = locationData.name;
      updated.push('display_name');
    } else if (locationData.name) {
      skipped.push('display_name (already set)');
    }

    if (locationData.addressLine1 && !vendor.addressLine1) {
      updateData.address_line1 = locationData.addressLine1;
      updated.push('address_line1');
    } else if (locationData.addressLine1) {
      skipped.push('address_line1 (already set)');
    }

    if (locationData.addressLine2 && !vendor.addressLine2) {
      updateData.address_line2 = locationData.addressLine2;
      updated.push('address_line2');
    } else if (locationData.addressLine2) {
      skipped.push('address_line2 (already set)');
    }

    if (locationData.city && !vendor.city) {
      updateData.city = locationData.city;
      updated.push('city');
    } else if (locationData.city) {
      skipped.push('city (already set)');
    }

    if (locationData.state && !vendor.state) {
      updateData.state = locationData.state;
      updated.push('state');
    } else if (locationData.state) {
      skipped.push('state (already set)');
    }

    if (locationData.postalCode && !vendor.postalCode) {
      updateData.postal_code = locationData.postalCode;
      updated.push('postal_code');
    } else if (locationData.postalCode) {
      skipped.push('postal_code (already set)');
    }

    if (locationData.phone && !vendor.phone) {
      updateData.phone = locationData.phone;
      updated.push('phone');
    } else if (locationData.phone) {
      skipped.push('phone (already set)');
    }

    if (locationData.timezone && !vendor.timezone) {
      updateData.timezone = locationData.timezone;
      updated.push('timezone');
    } else if (locationData.timezone) {
      skipped.push('timezone (already set)');
    }

    console.log(`\n📝 Update summary:`);
    console.log(`   Fields to update: ${updated.length > 0 ? updated.join(', ') : 'none'}`);
    console.log(`   Fields to skip: ${skipped.length > 0 ? skipped.join(', ') : 'none'}`);

    if (Object.keys(updateData).length === 0) {
      console.log(`\n⚠️  No fields to update (all fields already set or not provided by Square)`);
      return;
    }

    // Update vendor
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.error(`❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
      process.exit(1);
    }

    console.log(`\n💾 Updating vendor in database...`);
    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false
      }
    });

    const { error: updateError } = await supabase
      .from('vendors')
      .update(updateData)
      .eq('slug', vendorSlug);

    if (updateError) {
      console.error(`❌ Failed to update vendor: ${updateError.message}`);
      process.exit(1);
    }

    console.log(`✅ Vendor updated successfully!`);
    console.log(`\n📊 Updated fields:`);
    for (const field of updated) {
      console.log(`   - ${field}`);
    }

    // Verify update
    const updatedVendor = await dataClient.getVendorBySlug(vendorSlug);
    if (updatedVendor) {
      console.log(`\n✅ Verification - Updated vendor data:`);
      console.log(`   Address: ${updatedVendor.addressLine1 || '(empty)'}`);
      if (updatedVendor.addressLine2) {
        console.log(`            ${updatedVendor.addressLine2}`);
      }
      console.log(`   City: ${updatedVendor.city || '(empty)'}`);
      console.log(`   State: ${updatedVendor.state || '(empty)'}`);
      console.log(`   Postal Code: ${updatedVendor.postalCode || '(empty)'}`);
      console.log(`   Phone: ${updatedVendor.phone || '(empty)'}`);
      console.log(`   Timezone: ${updatedVendor.timezone || '(empty)'}`);
    }

    console.log(`\n✅ Test completed successfully!\n`);
  } catch (error) {
    console.error(`\n❌ Test failed:`, error);
    if (error instanceof Error) {
      console.error(`   Error message: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Run test
const vendorSlug = process.argv[2];
if (!vendorSlug) {
  console.error('Usage: pnpm tsx scripts/test-prefill-vendor.ts <vendor-slug>');
  process.exit(1);
}

testPrefillVendor(vendorSlug);

