import type { TJMDataPoint } from '../core/types/tjm';
import { getTJMDataPoints } from '../storage/db';

export interface AggregatedTJM {
  title: string;
  location: string | null;
  min: number;
  median: number;
  max: number;
  count: number;
  stddev: number;
  dataPoints: TJMDataPoint[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\w\s]/g, '').trim();
}

export async function aggregateTJMData(title: string, location: string | null): Promise<AggregatedTJM | null> {
  const allPoints = await getTJMDataPoints();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const normalizedTitle = normalizeTitle(title);

  const filtered = allPoints.filter(p => {
    const pointDate = p.date instanceof Date ? p.date : new Date(p.date);
    if (pointDate < thirtyDaysAgo) return false;
    if (!normalizeTitle(p.title).includes(normalizedTitle) && !normalizedTitle.includes(normalizeTitle(p.title))) return false;
    if (location && p.location && !p.location.toLowerCase().includes(location.toLowerCase())) return false;
    return true;
  });

  if (filtered.length === 0) return null;

  const tjms = filtered.map(p => p.tjm);

  return {
    title,
    location,
    min: Math.min(...tjms),
    median: median(tjms),
    max: Math.max(...tjms),
    count: filtered.length,
    stddev: Math.round(stddev(tjms)),
    dataPoints: filtered,
  };
}

// Standalone version for testing (doesn't read from IndexedDB)
export function aggregateFromPoints(points: TJMDataPoint[], title: string, location: string | null): AggregatedTJM | null {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const normalizedTitle = normalizeTitle(title);

  const filtered = points.filter(p => {
    const pointDate = p.date instanceof Date ? p.date : new Date(p.date);
    if (pointDate < thirtyDaysAgo) return false;
    if (!normalizeTitle(p.title).includes(normalizedTitle) && !normalizedTitle.includes(normalizeTitle(p.title))) return false;
    if (location && p.location && !p.location.toLowerCase().includes(location.toLowerCase())) return false;
    return true;
  });

  if (filtered.length === 0) return null;

  const tjms = filtered.map(p => p.tjm);

  return {
    title,
    location,
    min: Math.min(...tjms),
    median: median(tjms),
    max: Math.max(...tjms),
    count: filtered.length,
    stddev: Math.round(stddev(tjms)),
    dataPoints: filtered,
  };
}
