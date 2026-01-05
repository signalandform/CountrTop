/**
 * Analytics Data Models
 * 
 * Types for KDS Performance Analytics, Revenue Analytics, and Customer Analytics
 */

// ============================================================================
// KDS Performance Analytics (Milestone 9)
// ============================================================================

export type KdsSummary = {
  period: {
    start: string; // ISO 8601
    end: string; // ISO 8601
  };
  totals: {
    ticketsPlaced: number;
    ticketsReady: number;
    ticketsCompleted: number;
    ticketsCanceled: number;
  };
  averages: {
    prepTimeMinutes: number | null; // placed -> ready (null if no ready tickets)
    totalTimeMinutes: number | null; // placed -> completed (null if no completed tickets)
    queueDepth: number; // average active tickets
  };
  throughput: {
    ticketsPerHour: number;
    ticketsPerDay: number;
  };
};

export type KdsThroughputPoint = {
  timestamp: string; // ISO 8601 in vendor timezone
  count: number;
  avgPrepTime: number | null;
};

export type KdsPrepTimePoint = {
  timestamp: string; // ISO 8601 in vendor timezone
  avgPrepTimeMinutes: number | null;
  count: number;
};

export type KdsHeatmapCell = {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  hour: number; // 0-23
  count: number;
  avgPrepTimeMinutes: number | null;
};

export type KdsSourceMetrics = {
  countrtop_online: {
    count: number;
    avgPrepTimeMinutes: number | null;
    avgTotalTimeMinutes: number | null;
  };
  square_pos: {
    count: number;
    avgPrepTimeMinutes: number | null;
    avgTotalTimeMinutes: number | null;
  };
};

// ============================================================================
// Revenue Analytics (Milestone 10A)
// ============================================================================

export type RevenuePoint = {
  timestamp: string; // ISO 8601 in vendor timezone
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
};

export type RevenueBySource = {
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

export type AovPoint = {
  timestamp: string; // ISO 8601 in vendor timezone
  averageOrderValue: number;
  orderCount: number;
};

// ============================================================================
// Customer Analytics (Milestone 10B - CountrTop Online Only)
// ============================================================================

export type CustomerSummary = {
  // Label: "CountrTop Online Only"
  totalCustomers: number;
  repeatCustomers: number;
  repeatCustomerRate: number; // 0-1
  averageOrdersPerCustomer: number;
  averageLifetimeValue: number;
  newCustomers: number; // in period
  returningCustomers: number; // in period
};

export type CustomerLtvPoint = {
  userId: string;
  orderCount: number;
  totalRevenue: number;
  firstOrderDate: string;
  lastOrderDate: string;
  averageOrderValue: number;
};

export type RepeatCustomerMetrics = {
  repeatCustomerRate: number; // 0-1
  totalCustomers: number;
  repeatCustomers: number;
  singleOrderCustomers: number;
};

// ============================================================================
// Item Performance (Milestone 10B)
// ============================================================================

export type ItemPerformance = {
  itemName: string;
  quantity: number;
  revenue: number;
  orderCount: number;
  avgPrice: number;
  avgPrepTimeMinutes: number | null; // if correlated with tickets
};

