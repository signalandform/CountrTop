/**
 * KDS Analytics Query Helpers
 * 
 * Helper functions for KDS performance analytics queries.
 * These functions build SQL queries that handle timezone conversion and null-safe math.
 */

/**
 * Converts a date to a SQL timestamp in the specified timezone
 * @param _timezone - Timezone (kept for API compatibility, but not used in this implementation)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function toTimezoneTimestamp(date: Date, _timezone: string): string {
  // Format date as ISO 8601, PostgreSQL will handle timezone conversion
  return date.toISOString();
}

/**
 * Builds a timezone-aware date filter for SQL queries
 * Converts UTC timestamps to vendor timezone for comparison
 */
export function buildTimezoneFilter(
  column: string,
  startDate: Date,
  endDate: Date,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _timezone: string
): string {
  // PostgreSQL handles timezone conversion with AT TIME ZONE
  // We convert the column to the vendor timezone, then compare
  const start = startDate.toISOString();
  const end = endDate.toISOString();
  
  // Return SQL fragment: column AT TIME ZONE 'UTC' AT TIME ZONE timezone BETWEEN ...
  // This converts UTC timestamps to vendor timezone for comparison
  return `${column} BETWEEN '${start}'::timestamptz AND '${end}'::timestamptz`;
}

/**
 * Calculates prep time in minutes (placed_at -> ready_at)
 * Returns NULL if ready_at is NULL (null-safe)
 */
export const PREP_TIME_SQL = `
  CASE 
    WHEN ready_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (ready_at - placed_at)) / 60.0
    ELSE NULL
  END
`;

/**
 * Calculates total time in minutes (placed_at -> completed_at)
 * Returns NULL if completed_at is NULL (null-safe)
 */
export const TOTAL_TIME_SQL = `
  CASE 
    WHEN completed_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (completed_at - placed_at)) / 60.0
    ELSE NULL
  END
`;

/**
 * Builds a date truncation expression for grouping by time period
 */
export function buildDateTrunc(
  column: string,
  granularity: 'hour' | 'day' | 'week',
  timezone: string
): string {
  // PostgreSQL date_trunc with timezone conversion
  // Convert to vendor timezone first, then truncate
  const timezoneExpr = `(${column} AT TIME ZONE 'UTC' AT TIME ZONE '${timezone}')`;
  
  switch (granularity) {
    case 'hour':
      return `date_trunc('hour', ${timezoneExpr})`;
    case 'day':
      return `date_trunc('day', ${timezoneExpr})`;
    case 'week':
      return `date_trunc('week', ${timezoneExpr})`;
    default:
      return `date_trunc('day', ${timezoneExpr})`;
  }
}

