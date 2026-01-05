/**
 * Revenue Analytics SQL Helpers
 * 
 * Utilities for building revenue analytics queries with timezone conversion
 * and null-safe math.
 */

/**
 * Converts a Date to a SQL timestamp string in the specified timezone
 */
export function toTimezoneTimestamp(date: Date, timezone: string): string {
  return `(TIMESTAMP '${date.toISOString()}' AT TIME ZONE 'UTC' AT TIME ZONE '${timezone}')`;
}

/**
 * Builds a timezone-aware date filter for SQL queries
 */
export function buildTimezoneFilter(
  column: string,
  startDate: Date,
  endDate: Date,
  timezone: string
): string {
  const start = toTimezoneTimestamp(startDate, timezone);
  const end = toTimezoneTimestamp(endDate, timezone);
  return `${column} >= ${start} AND ${column} < ${end}`;
}

/**
 * SQL fragment for extracting total money amount from square_orders.total_money JSONB
 * Handles null safely: returns 0 if null or missing
 */
export const TOTAL_MONEY_SQL = `
  COALESCE(
    (square_orders.total_money->>'amount')::bigint,
    0
  ) / 100.0
`;

/**
 * SQL fragment for extracting currency from square_orders.total_money JSONB
 */
export const CURRENCY_SQL = `
  COALESCE(
    square_orders.total_money->>'currency_code',
    'USD'
  )
`;

/**
 * SQL fragment for counting line items from square_orders.line_items JSONB array
 * Handles null safely: returns 0 if null
 */
export const LINE_ITEM_COUNT_SQL = `
  COALESCE(
    jsonb_array_length(COALESCE(square_orders.line_items, '[]'::jsonb)),
    0
  )
`;

/**
 * Builds a date truncation expression for grouping by time period
 */
export function buildDateTrunc(
  column: string,
  granularity: 'hour' | 'day' | 'week' | 'month',
  timezone: string
): string {
  const period = granularity.toUpperCase();
  return `date_trunc('${period}', ${column} AT TIME ZONE 'UTC' AT TIME ZONE '${timezone}') AT TIME ZONE '${timezone}'`;
}

/**
 * Extracts revenue from order snapshot JSON
 * Handles missing fields, null values, and invalid types
 */
export function extractRevenueFromSnapshot(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  
  const total = (snapshot as Record<string, unknown>).total;
  if (!total || typeof total !== 'object') return 0;
  
  const amount = (total as Record<string, unknown>).amount;
  if (amount === null || amount === undefined) return 0;
  
  if (typeof amount === 'number') {
    return amount / 100.0; // Convert cents to dollars
  }
  if (typeof amount === 'string') {
    const parsed = parseFloat(amount);
    return isNaN(parsed) ? 0 : parsed / 100.0;
  }
  
  return 0;
}

