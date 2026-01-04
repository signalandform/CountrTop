#!/usr/bin/env tsx
/**
 * Milestone 8.5: Backfill Vendor Timezones
 * 
 * One-time script to backfill vendor timezone from Square API.
 * This ensures all vendors have their timezone populated for analytics.
 * 
 * Usage:
 *   pnpm --filter @countrtop/data exec tsx scripts/backfillVendorTimezones.ts
 */

import { createClient } from '@supabase/supabase-js';
import { getSquareLocation } from '@countrtop/api-client';
import { createDataClient, type Database } from '@countrtop/data';

async function backfillVendorTimezones() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    }
  });

  const dataClient = createDataClient({ supabase });

  console.log('Fetching all vendors...');
  const { data: vendors, error: fetchError } = await supabase
    .from('vendors')
    .select('id, slug, square_location_id, timezone')
    .order('slug');

  if (fetchError) {
    console.error('Error fetching vendors:', fetchError);
    process.exit(1);
  }

  if (!vendors || vendors.length === 0) {
    console.log('No vendors found');
    return;
  }

  console.log(`Found ${vendors.length} vendor(s)`);
  console.log('');

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const vendor of vendors) {
    try {
      // Skip if timezone is already set (unless it's "UTC" placeholder)
      if (vendor.timezone && vendor.timezone !== 'UTC') {
        console.log(`✓ ${vendor.slug}: timezone already set (${vendor.timezone})`);
        skippedCount++;
        continue;
      }

      if (!vendor.square_location_id) {
        console.log(`⚠ ${vendor.slug}: no square_location_id, skipping`);
        skippedCount++;
        continue;
      }

      console.log(`Fetching Square location for ${vendor.slug}...`);
      const vendorFull = await dataClient.getVendorById(vendor.id);
      if (!vendorFull) {
        console.error(`  Error: vendor ${vendor.id} not found`);
        errorCount++;
        continue;
      }

      const locationData = await getSquareLocation(vendorFull, vendor.square_location_id);

      if (!locationData.timezone) {
        console.log(`⚠ ${vendor.slug}: Square location has no timezone`);
        skippedCount++;
        continue;
      }

      // Update vendor timezone
      const { error: updateError } = await supabase
        .from('vendors')
        .update({ timezone: locationData.timezone })
        .eq('id', vendor.id);

      if (updateError) {
        console.error(`  Error updating ${vendor.slug}:`, updateError.message);
        errorCount++;
        continue;
      }

      console.log(`✓ ${vendor.slug}: updated timezone to ${locationData.timezone}`);
      updatedCount++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  Error processing ${vendor.slug}:`, errorMessage);
      errorCount++;
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Updated: ${updatedCount}`);
  console.log(`  Skipped: ${skippedCount}`);
  console.log(`  Errors: ${errorCount}`);
}

backfillVendorTimezones()
  .then(() => {
    console.log('');
    console.log('Backfill complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

