import type { NextApiRequest, NextApiResponse } from 'next';
import { reconcileSquareOrdersForLocation } from '@countrtop/data/src/reconcile';
import { createLogger } from '@countrtop/api-client';
import { getServerDataClient } from '../../../lib/dataClient';

const logger = createLogger({ requestId: 'cron-poll-square' });

type PollResponse = {
  ok: boolean;
  summary: {
    locationsProcessed: number;
    totalProcessed: number;
    totalCreatedTickets: number;
    totalUpdatedTickets: number;
    totalErrors: number;
  };
  locations: Array<{
    locationId: string;
    vendorSlug: string;
    stats: {
      processed: number;
      createdTickets: number;
      updatedTickets: number;
      errors: number;
    };
  }>;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PollResponse>
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      summary: {
        locationsProcessed: 0,
        totalProcessed: 0,
        totalCreatedTickets: 0,
        totalUpdatedTickets: 0,
        totalErrors: 0
      },
      locations: [],
      error: 'Method not allowed'
    });
  }

  // Verify secret token (required for cron jobs)
  // Vercel Cron sends Authorization: Bearer <secret> when CRON_SECRET is set (see vercel.com/docs/cron-jobs)
  // Also accept X-Vercel-Authorization, query param, body for compatibility and manual testing
  const authHeader = req.headers['authorization'];
  const vercelAuthHeader = req.headers['x-vercel-authorization'];
  const secret = authHeader?.replace(/^Bearer\s+/i, '') ||
                 vercelAuthHeader ||
                 (req.query.secret as string) ||
                 req.body?.secret;

  // CRON_SECRET is what Vercel reads to send the header; VERCEL_CRON_SECRET as fallback
  const expectedSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;

  // If secret is set, require it to match
  // If not set, allow access (for development/testing - NOT recommended for production)
  if (expectedSecret) {
    if (!secret || secret !== expectedSecret) {
      logger.warn('Unauthorized cron request', {
        hasSecret: !!secret,
        hasExpectedSecret: !!expectedSecret,
        hasVercelHeader: !!vercelAuthHeader,
        hasAuthHeader: !!authHeader
      });
      return res.status(401).json({
        ok: false,
        summary: {
          locationsProcessed: 0,
          totalProcessed: 0,
          totalCreatedTickets: 0,
          totalUpdatedTickets: 0,
          totalErrors: 0
        },
        locations: [],
        error: 'Unauthorized'
      });
    }
  }

  const minutesBack = parseInt(
    (req.query.minutesBack as string) || process.env.POLL_MINUTES_BACK || '10',
    10
  );

  try {
    const dataClient = getServerDataClient();

    // Determine which locations to poll
    // Option A: Use env var SQUARE_LOCATION_IDS (comma-separated)
    // Option B: Query vendors table for active vendors with square_location_id
    let locationIds: Array<{ locationId: string; vendorSlug: string; vendorId: string }> = [];

    const squareLocationIdsEnv = process.env.SQUARE_LOCATION_IDS;
    if (squareLocationIdsEnv) {
      // Option A: Use env var
      const ids = squareLocationIdsEnv.split(',').map(id => id.trim()).filter(Boolean);
      for (const locationId of ids) {
        const vendor = await dataClient.getVendorBySquareLocationId(locationId);
        if (vendor) {
          locationIds.push({
            locationId,
            vendorSlug: vendor.slug,
            vendorId: vendor.id
          });
        } else {
          logger.warn(`Vendor not found for location ${locationId}`, { locationId });
        }
      }
    } else {
      // Option B: Query all active vendors with square_location_id
      // Note: We don't have a listAllVendors method, so we'll need to query directly
      // For now, let's use a simple approach: query vendors table
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: {
            persistSession: false
          }
        });

        const { data: vendors, error } = await supabase
          .from('vendors')
          .select('id, slug, square_location_id')
          .not('square_location_id', 'is', null)
          .eq('status', 'active');

        if (error) {
          logger.error('Failed to query vendors', error, {});
        } else if (vendors) {
          locationIds = vendors
            .filter(v => v.square_location_id)
            .map(v => ({
              locationId: v.square_location_id!,
              vendorSlug: v.slug,
              vendorId: v.id
            }));
        }
      }
    }

    if (locationIds.length === 0) {
      logger.warn('No locations to poll');
      return res.status(200).json({
        ok: true,
        summary: {
          locationsProcessed: 0,
          totalProcessed: 0,
          totalCreatedTickets: 0,
          totalUpdatedTickets: 0,
          totalErrors: 0
        },
        locations: []
      });
    }

    logger.info('Starting cron reconciliation', {
      locationCount: locationIds.length,
      minutesBack
    });

    // Process each location
    const results: PollResponse['locations'] = [];
    let totalProcessed = 0;
    let totalCreatedTickets = 0;
    let totalUpdatedTickets = 0;
    let totalErrors = 0;

    for (const { locationId, vendorSlug, vendorId } of locationIds) {
      try {
        const vendor = await dataClient.getVendorById(vendorId);
        if (!vendor) {
          logger.warn(`Vendor not found: ${vendorId}`, { vendorId, locationId });
          continue;
        }

        const stats = await reconcileSquareOrdersForLocation(
          dataClient,
          vendor,
          locationId,
          minutesBack
        );

        results.push({
          locationId,
          vendorSlug,
          stats
        });

        totalProcessed += stats.processed;
        totalCreatedTickets += stats.createdTickets;
        totalUpdatedTickets += stats.updatedTickets;
        totalErrors += stats.errors;
      } catch (error) {
        totalErrors++;
        logger.error(`Failed to reconcile location ${locationId}`, error instanceof Error ? error : new Error(String(error)), {
          locationId,
          vendorSlug
        });
        results.push({
          locationId,
          vendorSlug,
          stats: {
            processed: 0,
            createdTickets: 0,
            updatedTickets: 0,
            errors: 1
          }
        });
      }
    }

    const summary: PollResponse['summary'] = {
      locationsProcessed: results.length,
      totalProcessed,
      totalCreatedTickets,
      totalUpdatedTickets,
      totalErrors
    };

    logger.info('Cron reconciliation complete', summary);

    return res.status(200).json({
      ok: true,
      summary,
      locations: results
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Cron reconciliation failed', error instanceof Error ? error : new Error(errorMessage), {});
    return res.status(500).json({
      ok: false,
      summary: {
        locationsProcessed: 0,
        totalProcessed: 0,
        totalCreatedTickets: 0,
        totalUpdatedTickets: 0,
        totalErrors: 0
      },
      locations: [],
      error: errorMessage
    });
  }
}

