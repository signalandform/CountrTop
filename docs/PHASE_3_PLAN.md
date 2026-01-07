# Phase 3: Analytics Overdrive — Build Plan

## Goal
Build comprehensive analytics and insights for vendors, focusing on KDS performance, operational efficiency, and customer behavior analytics powered by the rich data we're now collecting from Square orders and kitchen tickets.

## Current State
- **Basic Insights:** Lifetime metrics (orders, customers, loyalty points, top items)
- **KDS Data:** Rich ticket data with timestamps (placed_at, ready_at, completed_at)
- **Square Orders:** Full order mirror with line items, metadata, source attribution
- **Data Infrastructure:** Tables indexed and ready for analytics queries

## Target State
- **KDS Performance Analytics:** Ticket throughput, average prep times, queue depth analytics
- **Operational Metrics:** Peak hour analysis, efficiency metrics, staff performance insights
- **Revenue Analytics:** Revenue trends, item performance, source attribution (online vs POS)
- **Customer Analytics:** Repeat customer insights, customer lifetime value, ordering patterns
- **Real-time Dashboard:** Live metrics with time-series visualizations

---

## Milestone 8.5: Data Hygiene & Analytics Readiness

### Goal
Ensure data is trustworthy and analytics-ready before building dashboards. Fix timezone inconsistencies and timestamp gaps that would break analytics charts.

### Key Features

#### 8.5.1: Vendor Timezone Population
- **Ensure `vendors.timezone` is populated:**
  - Default from Square location timezone if null
  - Migration to backfill existing vendors from Square API
  - Validation on vendor updates

**Data Source:**
- `vendors.timezone` column
- Square Locations API (`GET /v2/locations/{location_id}`) for timezone

#### 8.5.2: Ticket Timestamp Consistency
- **Ensure `kitchen_tickets` timestamps are consistent:**
  - `placed_at` always exists (already enforced ✅)
  - `ready_at`, `completed_at`, `canceled_at` set correctly on status transitions
  - Handle null values gracefully in analytics queries

**Validation:**
- Migration to verify timestamp integrity
- Analytics queries must handle null timestamps (exclude from averages, not error)

#### 8.5.3: Database Indexes for Analytics
- **Add missing indexes for analytics queries:**
  - `kitchen_tickets(location_id, placed_at)` - Time-range queries
  - `kitchen_tickets(location_id, status, placed_at)` - Status-filtered time queries
  - `square_orders(location_id, created_at)` - Revenue time queries
  - Partial index: `order_snapshots(vendor_id, user_id, placed_at) WHERE user_id IS NOT NULL` - Customer analytics

**Migration:**
- Create indexes if not present (idempotent)
- Verify query performance

### Implementation Steps

1. **Timezone Migration**
   - Create migration to backfill `vendors.timezone` from Square API
   - Update vendor prefill logic to always include timezone
   - Add validation on vendor updates

2. **Timestamp Validation**
   - Create migration to verify timestamp integrity
   - Update ticket status update logic to ensure timestamps are set
   - Add analytics query helpers that handle null timestamps gracefully

3. **Index Creation**
   - Create migration for analytics indexes
   - Verify indexes are used in query plans
   - Monitor query performance

### Acceptance Criteria

✅ **Timezone:**
- All vendors have `timezone` populated
- Vendor updates preserve/update timezone
- Analytics queries use vendor timezone for bucketing

✅ **Timestamps:**
- All tickets have `placed_at`
- Status transitions set appropriate timestamps (`ready_at`, `completed_at`, `canceled_at`)
- Analytics queries handle null values correctly (exclude, don't error)

✅ **Indexes:**
- All analytics indexes created and verified
- Query plans show index usage
- 30-day range queries complete in < 2 seconds

---

## Milestone 9: KDS Performance Analytics + Operational Metrics

### Goal
Provide vendors with deep insights into their kitchen operations, ticket performance, and operational efficiency.

### Key Features

#### 9.1: Ticket Performance Metrics
- **Average Prep Time:** Time from `placed_at` to `ready_at`
- **Average Total Time:** Time from `placed_at` to `completed_at`
- **Queue Depth:** Number of active tickets at any point in time
- **Throughput:** Tickets completed per hour/day
- **Status Distribution:** Breakdown of ticket statuses over time
- **Peak Hour Analysis:** Identify busiest times for ticket placement

**Data Source:**
- `kitchen_tickets` table with `placed_at`, `ready_at`, `completed_at` timestamps
- Filter by `location_id` for vendor-scoped analytics
- Time range filters (today, week, month, custom range)

#### 9.2: Source Attribution Analytics
- **Online vs POS Performance:** Compare prep times by source (`countrtop_online` vs `square_pos`)
- **Volume by Source:** Order volume breakdown
- **Efficiency by Source:** Which source has faster prep times?

**Data Source:**
- `kitchen_tickets.source` field
- `square_orders.source` field

#### 9.3: Operational Efficiency Metrics
- **Ticket Aging:** Track how long tickets stay in each status
- **Bottleneck Detection:** Identify status transitions that take longest
- **Daily/Weekly Patterns:** Day-of-week and hour-of-day performance patterns

**Visualizations:**
- Time-series charts (tickets/hour, avg prep time over time)
- Histograms (prep time distribution)
- Heatmaps (day/hour performance)
- Status flow diagrams

### Implementation Steps

1. **Create Analytics Query Layer**
   - New methods in `SupabaseDataClient` for KDS analytics
   - Aggregate queries with time windows
   - Efficient date range filtering

2. **API Endpoints**
   - `GET /api/vendors/[slug]/analytics/kds-performance`
   - `GET /api/vendors/[slug]/analytics/operational-efficiency`
   - Support time range queries (startDate, endDate, timezone)

3. **UI Components**
   - New analytics section in vendor admin dashboard
   - Time-series charts (using a charting library like Recharts or Chart.js)
   - Metric cards with trend indicators
   - Date range picker

4. **Database Optimizations**
   - Indexes on timestamp columns for efficient time-range queries
   - Materialized views for expensive aggregations (optional)

---

## Milestone 10: Revenue Analytics + Customer Insights

### Goal
Provide vendors with financial insights and customer behavior analytics to help them understand their business better.

### Key Features

#### 10.1: Revenue Analytics
- **Revenue Trends:** Revenue over time (daily, weekly, monthly)
- **Source Revenue:** Revenue breakdown by source (online vs POS)
- **Item Performance:** Top revenue-generating items
- **Average Order Value:** AOV trends over time
- **Revenue Forecasts:** Simple trend-based forecasts

**Data Source:**
- `square_orders.line_items` (contains pricing data in JSONB)
- `square_orders.metadata` (may contain additional revenue data)
- Parse JSON in SQL for v1 (optimize with facts tables later if needed)
- Scope by `location_id` for vendor filtering

#### 10A.2: Source Attribution
- **Revenue breakdown by source:**
  - Online (`countrtop_online`) vs POS (`square_pos`) revenue split
  - Volume and revenue comparison by source
  - Average order value by source

**Data Source:**
- `square_orders.source` field
- Aggregate revenue from `line_items` by source

#### 10A.3: Top Revenue Items (Optional)
- **Simple item performance:**
  - Top items by revenue (if easy to extract from JSON)
  - Defer complex item analytics to Milestone 10B

**Note:** If JSON parsing becomes slow (>2 seconds for 30 days), defer to facts tables or Milestone 10B.

### Implementation Steps

1. **Revenue Data Layer**
   - Parse `square_orders.line_items` JSONB in SQL
   - Extract pricing and calculate totals
   - Aggregate by time period and source

2. **API Endpoints**
   - `GET /api/vendors/[slug]/analytics/revenue-series`
   - `GET /api/vendors/[slug]/analytics/revenue-by-source`
   - Support date range and granularity (day/week/month)

3. **UI Components**
   - Revenue line charts (daily/weekly/monthly trends)
   - Source breakdown bar charts
   - Average order value trends

### Acceptance Criteria

✅ **Revenue Analytics:**
- Revenue trends visible for any date range (up to 90 days)
- Revenue breakdown by source (online vs POS)
- Average order value trends displayed
- Queries complete in < 2 seconds for 30-day range

✅ **Performance:**
- If queries > 2 seconds, plan for facts tables
- JSON parsing is acceptable for v1 (90 days max)

---

## Milestone 10B: Customer Analytics + Item Performance

### Goal
Provide deeper customer insights and item performance analytics, clearly scoped to CountrTop online orders only.

### Key Features

#### 10B.1: Customer Analytics (CountrTop Online Only)
- **Customer Lifetime Value:** Total revenue per customer
- **Repeat Customer Rate:** Percentage of customers with multiple orders
- **Customer Acquisition:** New vs returning customers over time
- **Order Frequency:** Average orders per customer
- **Customer Segmentation:** High-value, mid-value, low-value customers

**Data Source:**
- `order_snapshots.user_id` for customer attribution
- `order_snapshots.snapshot_json` for order totals
- Join with `kitchen_tickets` for CountrTop orders

#### 10.3: Item & Menu Analytics
- **Best Sellers:** Top items by quantity and revenue
- **Item Performance Trends:** Item popularity over time
- **Menu Efficiency:** Which items have fastest prep times?
- **Item Pairing Analysis:** What items are commonly ordered together?

**Data Source:**
- `square_orders.line_items` (item names, quantities, prices in JSONB)
- `kitchen_tickets` (prep time correlation)
- Parse JSON in SQL for v1 (optimize with facts tables if slow)

### Implementation Steps

1. **Customer Analytics Layer**
   - Filter to CountrTop orders only (`user_id IS NOT NULL` OR `reference_id LIKE 'ct_%'`)
   - Join `order_snapshots` with revenue data
   - Calculate customer lifetime metrics
   - Segment customers by value
   - **Label all UI/metrics as "CountrTop Online Only"**

2. **Item Analytics Layer**
   - Parse `square_orders.line_items` JSONB
   - Aggregate item performance (quantity, revenue)
   - Correlate with prep times from `kitchen_tickets`
   - If JSON parsing is slow, plan for facts tables

3. **API Endpoints**
   - `GET /api/vendors/[slug]/analytics/customers`
   - `GET /api/vendors/[slug]/analytics/items`
   - All endpoints clearly document "CountrTop Online Only" scope

4. **UI Components**
   - Customer cohort analysis tables (with "CountrTop Online Only" label)
   - Customer LTV charts (with disclaimer)
   - Item performance tables and charts
   - Prep time vs menu item correlation

### Acceptance Criteria

✅ **Customer Analytics:**
- Customer metrics clearly labeled "CountrTop Online Only"
- Repeat customer rate displayed
- Customer lifetime value calculated (online orders only)
- Customer segmentation visible
- Order frequency metrics shown

✅ **Item Analytics:**
- Item performance trends visible
- Top items by quantity and revenue
- Prep time vs menu item correlation (if feasible)
- Queries complete in < 3 seconds for 90-day range

✅ **Data Quality:**
- UI clearly indicates POS orders are excluded from customer analytics
- Vendors understand why customer totals may differ from order totals

---

## Technical Architecture

### Data Layer (`packages/data/src/supabaseClient.ts`)

**New Methods:**
```typescript
// KDS Performance Analytics
async getKDSPerformanceMetrics(
  locationId: string,
  startDate: Date,
  endDate: Date
): Promise<KDSPerformanceMetrics>

async getTicketThroughput(
  locationId: string,
  startDate: Date,
  endDate: Date,
  granularity: 'hour' | 'day' | 'week'
): Promise<TicketThroughput[]>

async getAveragePrepTimes(
  locationId: string,
  startDate: Date,
  endDate: Date,
  groupBy?: 'source' | 'day_of_week' | 'hour'
): Promise<PrepTimeMetrics[]>

// Revenue Analytics
async getRevenueMetrics(
  vendorId: string,
  startDate: Date,
  endDate: Date,
  granularity: 'day' | 'week' | 'month'
): Promise<RevenueMetrics[]>

async getItemPerformance(
  vendorId: string,
  startDate: Date,
  endDate: Date
): Promise<ItemPerformance[]>

// Customer Analytics
async getCustomerMetrics(
  vendorId: string,
  startDate: Date,
  endDate: Date
): Promise<CustomerMetrics>

async getCustomerLifetimeValue(
  vendorId: string
): Promise<CustomerLTV[]>
```

### API Layer

**Milestone 9 Routes:**
- `apps/vendor-admin-web/pages/api/vendors/[slug]/analytics/kds-summary.ts`
- `apps/vendor-admin-web/pages/api/vendors/[slug]/analytics/kds-throughput.ts`
- `apps/vendor-admin-web/pages/api/vendors/[slug]/analytics/kds-heatmap.ts`

**Milestone 10A Routes:**
- `apps/vendor-admin-web/pages/api/vendors/[slug]/analytics/revenue-series.ts`
- `apps/vendor-admin-web/pages/api/vendors/[slug]/analytics/revenue-by-source.ts`

**Milestone 10B Routes:**
- `apps/vendor-admin-web/pages/api/vendors/[slug]/analytics/customers.ts`
- `apps/vendor-admin-web/pages/api/vendors/[slug]/analytics/items.ts`

**Query Parameters:**
- `startDate` (ISO 8601)
- `endDate` (ISO 8601)
- `timezone` (IANA timezone, inferred from vendor if not provided)
- `granularity` (hour/day/week/month)

**Important:**
- All endpoints scope by `location_id` (vendor's `square_location_id`)
- All endpoints use vendor timezone for bucketing (not UTC)
- Customer endpoints clearly document "CountrTop Online Only" scope

### UI Layer

**New Components:**
- `apps/vendor-admin-web/components/AnalyticsDashboard.tsx`
- `apps/vendor-admin-web/components/metrics/KDSPerformanceChart.tsx`
- `apps/vendor-admin-web/components/metrics/RevenueChart.tsx`
- `apps/vendor-admin-web/components/metrics/CustomerInsights.tsx`
- `apps/vendor-admin-web/components/metrics/DateRangePicker.tsx`

**Navigation:**
- Add "Analytics" card to vendor admin dashboard
- New route: `/vendors/[slug]/analytics`
- Sub-sections: KDS Performance, Revenue, Customers, Items

---

## Data Models

### KDS Performance Metrics

```typescript
type KDSPerformanceMetrics = {
  period: {
    start: string;
    end: string;
  };
  totals: {
    ticketsPlaced: number;
    ticketsReady: number;
    ticketsCompleted: number;
    ticketsCanceled: number;
  };
  averages: {
    prepTimeMinutes: number; // placed -> ready
    totalTimeMinutes: number; // placed -> completed
    queueDepth: number; // average active tickets
  };
  throughput: {
    ticketsPerHour: number;
    ticketsPerDay: number;
  };
  bySource: {
    countrtop_online: SourceMetrics;
    square_pos: SourceMetrics;
  };
};

type SourceMetrics = {
  count: number;
  avgPrepTimeMinutes: number;
  avgTotalTimeMinutes: number;
};

type TicketThroughput = {
  timestamp: string;
  count: number;
  avgPrepTime: number;
};
```

### Revenue Metrics (Milestone 10A)

```typescript
type RevenuePoint = {
  timestamp: string; // ISO 8601 in vendor timezone
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
};

type RevenueBySource = {
  countrtop_online: {
    revenue: number;
    orderCount: number;
    averageOrderValue: number;
  };
  square_pos: {
    revenue: number;
    orderCount: number;
    averageOrderValue: number;
  };
  total: {
    revenue: number;
    orderCount: number;
    averageOrderValue: number;
  };
};

type AovPoint = {
  timestamp: string;
  averageOrderValue: number;
  orderCount: number;
};
```

### Customer Metrics (Milestone 10B - CountrTop Online Only)

```typescript
type CustomerSummary = {
  // Label: "CountrTop Online Only"
  totalCustomers: number;
  repeatCustomers: number;
  repeatCustomerRate: number; // 0-1
  averageOrdersPerCustomer: number;
  averageLifetimeValue: number;
  newCustomers: number; // in period
  returningCustomers: number; // in period
};

type CustomerLtvPoint = {
  userId: string;
  orderCount: number;
  totalRevenue: number;
  firstOrderDate: string;
  lastOrderDate: string;
  averageOrderValue: number;
};

type RepeatCustomerMetrics = {
  repeatCustomerRate: number; // 0-1
  totalCustomers: number;
  repeatCustomers: number;
  singleOrderCustomers: number;
};

type ItemPerformance = {
  itemName: string;
  quantity: number;
  revenue: number;
  orderCount: number;
  avgPrice: number;
  avgPrepTimeMinutes: number | null; // if correlated with tickets
};
```

---

## Database Optimizations

### Indexes for Analytics Queries

```sql
-- KDS Performance: Time-range queries on kitchen_tickets
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_location_placed_at 
  ON kitchen_tickets(location_id, placed_at);

CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_location_status_placed_at 
  ON kitchen_tickets(location_id, status, placed_at);

-- Revenue: Time-range queries on square_orders
CREATE INDEX IF NOT EXISTS idx_square_orders_location_created_at 
  ON square_orders(location_id, created_at);

-- Customer Analytics: User-based queries
CREATE INDEX IF NOT EXISTS idx_order_snapshots_vendor_user_placed_at 
  ON order_snapshots(vendor_id, user_id, placed_at) 
  WHERE user_id IS NOT NULL;
```

### Materialized Views (Optional)

For expensive aggregations, consider materialized views that refresh periodically:

```sql
-- Daily KDS metrics (refresh daily via cron)
CREATE MATERIALIZED VIEW IF NOT EXISTS kds_daily_metrics AS
SELECT 
  location_id,
  DATE(placed_at) as date,
  COUNT(*) as tickets_placed,
  AVG(EXTRACT(EPOCH FROM (ready_at - placed_at))/60) as avg_prep_time_minutes,
  ...
FROM kitchen_tickets
WHERE placed_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY location_id, DATE(placed_at);

CREATE INDEX ON kds_daily_metrics(location_id, date);
```

---

## UI/UX Considerations

### Chart Library
- **Recommendation:** Recharts (React-native compatible, lightweight)
- Alternative: Chart.js with react-chartjs-2
- For simple metrics: CSS-based progress bars and sparklines

### Date Range Picker
- Support for preset ranges: Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, Custom
- Timezone handling (vendor timezone from `vendors.timezone`)

### Loading States
- Skeleton loaders for charts
- Progressive loading (show cached data first, refresh in background)
- Optimistic UI updates

### Responsive Design
- Mobile-friendly charts (horizontal scroll for tables)
- Collapsible sections
- Export to CSV/PDF (optional, future enhancement)

---

## Implementation Phases

### Phase 3.0: Milestone 8.5 — Data Hygiene & Analytics Readiness
**Estimated Effort:** 3-5 days

1. **Day 1-2:**
   - Timezone migration (backfill from Square API)
   - Timestamp validation migration
   - Index creation migration

2. **Day 3:**
   - Verify timezone population
   - Test timestamp integrity
   - Validate index usage in query plans

3. **Day 4-5:**
   - Update vendor prefill logic to include timezone
   - Update ticket status logic to ensure timestamps
   - Documentation and testing

### Phase 3.1: Milestone 9 — KDS Performance Analytics
**Estimated Effort:** 2-3 weeks

1. **Week 1:**
   - Data layer methods (KDS performance queries with null-safe math)
   - API endpoints (timezone-aware bucketing)
   - Basic UI structure

2. **Week 2:**
   - Simple Recharts charts (throughput, prep time)
   - Date range picker with presets
   - Metric cards
   - Integration with vendor admin dashboard

3. **Week 3:**
   - Testing and refinement
   - Performance optimization
   - Documentation

### Phase 3.2: Milestone 10A — Revenue Trends + Source Attribution
**Estimated Effort:** 1-2 weeks

1. **Week 1:**
   - Revenue data extraction (JSON parsing in SQL)
   - API endpoints (revenue-series, revenue-by-source)
   - Revenue charts (line charts, bar charts)

2. **Week 2:**
   - Testing and refinement
   - Performance monitoring
   - If slow, plan for facts tables (but don't build yet)

### Phase 3.3: Milestone 10B — Customer Analytics + Item Performance
**Estimated Effort:** 2-3 weeks

1. **Week 1:**
   - Customer analytics queries (CountrTop online only)
   - Item performance queries (JSON parsing)
   - API endpoints

2. **Week 2:**
   - Customer insights UI (with "CountrTop Online Only" labels)
   - Item performance tables and charts
   - Prep time correlation (if feasible)

3. **Week 3:**
   - Testing and refinement
   - Performance optimization
   - Documentation (clear scope labeling)

---

## Acceptance Criteria

### Milestone 8.5
✅ **Timezone:**
- All vendors have `timezone` populated
- Vendor updates preserve/update timezone
- Analytics queries can use vendor timezone for bucketing

✅ **Timestamps:**
- All tickets have `placed_at`
- Status transitions set appropriate timestamps
- Analytics queries handle null values correctly (exclude, don't error)

✅ **Indexes:**
- All analytics indexes created and verified
- Query plans show index usage
- No missing indexes for analytics queries

### Milestone 9
✅ **KDS Performance Metrics:**
- Vendors can view average prep times for any date range
- Ticket throughput charts show hourly/daily patterns
- Source attribution analytics compare online vs POS performance
- Peak hour analysis identifies busiest times

✅ **Operational Efficiency:**
- Ticket aging metrics show time in each status
- Status transition analytics identify bottlenecks
- Day-of-week and hour-of-day patterns visible

✅ **UI/UX:**
- All metrics load in < 2 seconds for 30-day range
- Charts are responsive and mobile-friendly (simple Recharts)
- Date range picker works with vendor timezone
- Default presets (Today, Last 7 days, Last 30 days, Custom)

### Milestone 10A
✅ **Revenue Analytics:**
- Revenue trends visible for any date range (up to 90 days)
- Revenue breakdown by source (online vs POS)
- Average order value trends displayed
- Queries complete in < 2 seconds for 30-day range

✅ **Performance:**
- JSON parsing is acceptable for v1 (90 days max)
- If queries > 2 seconds, document need for facts tables (but don't build yet)

### Milestone 10B
✅ **Revenue Analytics:**
- Revenue trends visible for any date range
- Revenue breakdown by source (online vs POS)
- Top revenue-generating items identified
- Average order value trends displayed

✅ **Customer Analytics:**
- Customer lifetime value calculated
- Repeat customer rate displayed
- Customer segmentation visible
- Order frequency metrics shown

✅ **Customer Analytics:**
- All metrics clearly labeled "CountrTop Online Only"
- Repeat customer rate displayed
- Customer lifetime value calculated (online orders only)
- Customer segmentation visible
- Order frequency metrics shown
- UI clearly explains why POS orders are excluded

✅ **Item Analytics:**
- Item performance trends visible
- Top items by quantity and revenue
- Prep time vs menu item correlation (if feasible)
- Queries complete in < 3 seconds for 90-day range

✅ **Data Quality:**
- Vendors understand customer analytics scope
- Labels prevent confusion about totals

---

## Future Enhancements (Out of Scope)

- **Real-time Analytics:** Live dashboard with WebSocket updates
- **Predictive Analytics:** ML-based forecasts (demand prediction, prep time estimation)
- **Comparative Analytics:** Compare performance across time periods
- **Alerting:** Set thresholds for metrics and receive alerts
- **Export/Reporting:** PDF reports, CSV exports, scheduled reports
- **Multi-location Analytics:** Aggregate metrics across multiple locations (if vendor has multiple)

---

## Dependencies

- **Chart Library:** Recharts or Chart.js (add to `vendor-admin-web` package.json)
- **Date Library:** date-fns or dayjs (if not already using)
- **Database:** Existing Supabase setup (no new infrastructure needed)
- **API:** Existing Next.js API routes pattern

---

## Risks & Mitigation

1. **Performance:** Large date ranges may cause slow queries
   - **Mitigation:** Implement pagination, limit max date range, use materialized views

2. **Data Quality:** Missing timestamps or incomplete data
   - **Mitigation:** Handle null values gracefully, show data quality indicators

3. **Timezone Complexity:** Vendor timezones may cause confusion
   - **Mitigation:** Always display timezone, use vendor's timezone from database

4. **Cost:** Analytics queries may increase database load
   - **Mitigation:** Add appropriate indexes, use connection pooling, cache results

---

## Success Metrics

- **Adoption:** 80%+ of vendors view analytics at least once per week
- **Performance:** 95th percentile query time < 2 seconds
- **Data Coverage:** Analytics available for 90%+ of tickets/orders
- **User Satisfaction:** Positive feedback on insights usefulness

