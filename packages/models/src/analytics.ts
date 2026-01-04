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

