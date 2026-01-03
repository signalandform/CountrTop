#!/usr/bin/env tsx
/**
 * Script to manually poll Square orders and reconcile them
 * 
 * Usage:
 *   pnpm tsx scripts/pollSquareOrders.ts [vendor-slug] [location-id] [minutes-back]
 * 
 * Environment variables required:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - SQUARE_ACCESS_TOKEN (or SQUARE_ACCESS_TOKEN_<CREDENTIAL_REF>)
 *   - SQUARE_ENVIRONMENT (optional, defaults to 'sandbox')
 * 
 * Examples:
 *   pnpm tsx scripts/pollSquareOrders.ts sunset
 *   pnpm tsx scripts/pollSquareOrders.ts sunset LOCATION_ID 15
 */

import { reconcileSquareOrdersForLocation } from '../packages/data/src/reconcile';
import { getServerDataClient } from '../apps/customer-web/lib/dataClient';

async function pollSquareOrders() {
  const vendorSlug = process.argv[2] || process.env.VENDOR_SLUG;
  const locationId = process.argv[3] || process.env.LOCATION_ID;
  const minutesBackStr = process.argv[4] || process.env.MINUTES_BACK || '10';
  const minutesBack = parseInt(minutesBackStr, 10);

  if (!vendorSlug) {
    console.error('❌ Error: Vendor slug required');
    console.error('Usage: pnpm tsx scripts/pollSquareOrders.ts <vendor-slug> [location-id] [minutes-back]');
    console.error('   Or set VENDOR_SLUG, LOCATION_ID, MINUTES_BACK environment variables');
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }

  console.log('\n🔄 Starting Square orders reconciliation...\n');
  console.log(`   Vendor slug: ${vendorSlug}`);
  console.log(`   Minutes back: ${minutesBack}`);

  try {
    const dataClient = getServerDataClient();
    const vendor = await dataClient.getVendorBySlug(vendorSlug);

    if (!vendor) {
      console.error(`❌ Vendor not found: ${vendorSlug}`);
      process.exit(1);
    }

    console.log(`✅ Found vendor: ${vendor.displayName}`);
    console.log(`   Square Location ID: ${vendor.squareLocationId}`);

    const targetLocationId = locationId || vendor.squareLocationId;
    if (!targetLocationId) {
      console.error(`❌ No location ID provided and vendor has no square_location_id`);
      process.exit(1);
    }

    console.log(`\n📡 Polling Square orders updated in the last ${minutesBack} minutes...`);
    console.log(`   Location ID: ${targetLocationId}\n`);

    const stats = await reconcileSquareOrdersForLocation(
      dataClient,
      vendor,
      targetLocationId,
      minutesBack
    );

    console.log('\n✅ Reconciliation complete!\n');
    console.log('📊 Statistics:');
    console.log(`   Orders processed: ${stats.processed}`);
    console.log(`   Tickets created: ${stats.createdTickets}`);
    console.log(`   Tickets updated: ${stats.updatedTickets}`);
    if (stats.errors > 0) {
      console.log(`   Errors: ${stats.errors}`);
    }
    console.log('');

  } catch (error) {
    console.error('\n❌ Reconciliation failed:', error);
    if (error instanceof Error) {
      console.error(`   Error message: ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack}`);
      }
    }
    process.exit(1);
  }
}

pollSquareOrders();

