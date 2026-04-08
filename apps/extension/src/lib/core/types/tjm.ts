/**
 * TJM (Tarif Journalier Moyen) types for history tracking and trend analysis.
 * Pure types — no I/O, no async, no side effects.
 */
import type { SeniorityLevel } from './profile';

/** Direction of TJM trend for a given technology stack */
export type TJMTrend = 'up' | 'stable' | 'down';

/** Normalized French region identifier */
export type TJMRegion =
  | 'ile-de-france'
  | 'lyon'
  | 'marseille'
  | 'toulouse'
  | 'bordeaux'
  | 'nantes'
  | 'lille'
  | 'strasbourg'
  | 'rennes'
  | 'grenoble'
  | 'montpellier'
  | 'nice'
  | 'remote'
  | 'other';

/** A single TJM data point extracted from missions at a specific date */
export interface TJMRecord {
  /** Normalized technology stack name (lowercase) */
  stack: string;
  /** ISO 8601 date string (e.g. "2026-04-01") */
  date: string;
  /** Minimum TJM observed for this stack on this date */
  min: number;
  /** Maximum TJM observed for this stack on this date */
  max: number;
  /** Average TJM across all missions for this stack on this date */
  average: number;
  /** Number of missions contributing to this data point */
  sampleCount: number;
  /** Experience level extracted from missions, null when unavailable */
  seniority: SeniorityLevel | null;
  /** Normalized region, null for records created before region tracking */
  region: TJMRegion | null;
}

/** Aggregated statistics for a technology stack over time */
export interface TJMStats {
  stack: string;
  /** Current (most recent) average TJM */
  currentAverage: number;
  /** Previous average TJM (from the data point before the most recent) */
  previousAverage: number | null;
  /** Trend direction based on current vs previous average */
  trend: TJMTrend;
  /** All-time minimum TJM */
  allTimeMin: number;
  /** All-time maximum TJM */
  allTimeMax: number;
  /** Total number of data points */
  dataPointCount: number;
  /** Most recent record date (ISO 8601) */
  lastUpdated: string | null;
}

/** Range displayed in the TJM dashboard for a given market segment. */
export interface TJMRange {
  min: number;
  max: number;
  median: number;
}

/** Highlighted stack in the TJM dashboard. */
export interface TJMStackInsight {
  stack: string;
  average: number;
  trend: TJMTrend;
  sampleCount: number;
  lastUpdated: string | null;
}

/** TJM insight for a specific region. */
export interface TJMRegionInsight {
  region: TJMRegion;
  label: string;
  average: number;
  min: number;
  max: number;
  sampleCount: number;
  trend: TJMTrend;
}

/** UI-ready analysis for the TJM dashboard. */
export interface TJMAnalysis {
  trend: TJMTrend;
  confidence: number;
  dataPoints: number;
  junior: TJMRange;
  confirmed: TJMRange;
  senior: TJMRange;
  trendDetail: string | null;
  recommendation: string | null;
  lastUpdated: string | null;
  topStacks: TJMStackInsight[];
  /** Per-region TJM insights, sorted by average descending */
  regionInsights: TJMRegionInsight[];
}

/** History of TJM records, indexed by stack */
export interface TJMHistory {
  records: TJMRecord[];
}
