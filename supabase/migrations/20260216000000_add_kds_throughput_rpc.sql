-- KDS throughput aggregation: server-side bucketing for large date ranges
-- Replaces client-side grouping in getKdsThroughput for better performance.

CREATE OR REPLACE FUNCTION public.get_kds_throughput_buckets(
  p_location_id text,
  p_start_ts timestamptz,
  p_end_ts timestamptz,
  p_granularity text
)
RETURNS TABLE (
  bucket_key timestamptz,
  ticket_count bigint,
  avg_prep_minutes numeric
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      kt.placed_at,
      kt.ready_at,
      CASE p_granularity
        WHEN 'hour' THEN date_trunc('hour', kt.placed_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        WHEN 'day' THEN date_trunc('day', kt.placed_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        WHEN 'week' THEN (date_trunc('day', kt.placed_at AT TIME ZONE 'UTC') - (extract(dow from kt.placed_at AT TIME ZONE 'UTC')::int * interval '1 day')) AT TIME ZONE 'UTC'
        ELSE date_trunc('day', kt.placed_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      END AS bucket_ts
    FROM public.kitchen_tickets kt
    WHERE kt.location_id = p_location_id
      AND kt.placed_at >= p_start_ts
      AND kt.placed_at <= p_end_ts
      AND kt.completed_at IS NOT NULL
  ),
  grouped AS (
    SELECT
      f.bucket_ts,
      count(*)::bigint AS cnt,
      avg(
        CASE WHEN f.ready_at IS NOT NULL
          THEN extract(epoch from (f.ready_at - f.placed_at)) / 60.0
          ELSE NULL
        END
      ) AS avg_prep
    FROM filtered f
    GROUP BY f.bucket_ts
  )
  SELECT
    g.bucket_ts,
    g.cnt,
    g.avg_prep
  FROM grouped g
  ORDER BY g.bucket_ts;
END;
$$;

COMMENT ON FUNCTION public.get_kds_throughput_buckets IS 'Returns KDS throughput buckets (count and avg prep time) for a location and date range. Granularity: hour, day, week.';
