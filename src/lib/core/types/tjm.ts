export type SeniorityLevel = 'junior' | 'confirmed' | 'senior';

export type TJMTrend = 'up' | 'stable' | 'down';

export interface TJMRange {
  min: number;
  median: number;
  max: number;
}

export interface TJMAnalysis {
  junior: TJMRange;
  confirmed: TJMRange;
  senior: TJMRange;
  trend: TJMTrend;
  trendDetail: string;
  recommendation: string;
  confidence: number;
  dataPoints: number;
  analyzedAt: Date;
}

export interface TJMDataPoint {
  tjm: number;
  title: string;
  location: string | null;
  source: string;
  date: Date;
}
