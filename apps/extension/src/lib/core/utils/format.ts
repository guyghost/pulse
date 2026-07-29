/**
 * User-facing formatting — single source of truth across the extension UI.
 *
 * Pure (FC&IS): no `Date.now()`, no async, no side effects. The reference
 * time is always injected so callers in the shell/leaf own the clock, and
 * every function is mock-free unit-testable.
 *
 * Locale is fr-FR per PRODUCT.md (UI en français). Numbers use fr-FR
 * grouping (narrow no-break space) and dates use the fr-FR calendar.
 */

type DateInput = Date | number | null | undefined;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

// Module-level cached formatters (deterministic, pure, reused across calls)
const TJM_NUMBER_FORMATTER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('fr-FR', {
  numeric: 'auto',
  style: 'short',
});
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const MEDIUM_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function toEpochMs(value: DateInput): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const ms = typeof value === 'number' ? value : value.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Format a daily rate (EUR). Returns the fallback when the value is missing
 * or invalid, so call sites never render "null €/j" or "NaN €/j".
 *
 * `formatTJM(1200)` → "1 200 €/j"
 * `formatTJM(null)` → "Non précisé"
 */
export function formatTJM(
  value: number | null | undefined,
  options: { fallback?: string; suffix?: string } = {}
): string {
  const fallback = options.fallback ?? 'Non précisé';
  const suffix = options.suffix ?? '/j';
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  const grouped = TJM_NUMBER_FORMATTER.format(value);
  return `${grouped} €${suffix}`;
}

/**
 * Format a TJM range. Collapses to a single value when bounds are equal,
 * and to the fallback only when both bounds are missing.
 *
 * `formatTJMRange(600, 900)` → "600–900 €/j"
 * `formatTJMRange(700, 700)` → "700 €/j"
 * `formatTJMRange(null, null)` → "Non précisé"
 */
export function formatTJMRange(
  min: number | null | undefined,
  max: number | null | undefined,
  options: { fallback?: string; suffix?: string } = {}
): string {
  const hasMin = typeof min === 'number' && Number.isFinite(min) && min >= 0;
  const hasMax = typeof max === 'number' && Number.isFinite(max) && max >= 0;
  if (!hasMin && !hasMax) {
    return options.fallback ?? 'Non précisé';
  }
  if (hasMin && hasMax && min === max) {
    return formatTJM(min, options);
  }
  const lo = hasMin ? formatTJMAmount(min) : '—';
  const hi = hasMax ? formatTJMAmount(max) : '—';
  const suffix = options.suffix ?? '/j';
  return `${lo}–${hi} €${suffix}`;
}

function formatTJMAmount(value: number): string {
  return TJM_NUMBER_FORMATTER.format(value);
}

/**
 * Grouped amount with the EUR symbol but no suffix, for call sites that style
 * the unit separately (e.g. a muted "/j").
 *
 * `formatTJMValue(1200)` → "1 200 €"
 * `formatTJMValue(null)` → null
 */
export function formatTJMValue(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return `${formatTJMAmount(value)} €`;
}

/**
 * Compact relative time using the runtime's i18n tables (singular/plural and
 * the "hier"/"aujourd'hui" special cases come for free). `numeric: 'auto'`
 * yields "hier" rather than "il y a 1 jour"; `style: 'short'` keeps readability
 * while rendering natural past phrasing ("il y a 2 h", "il y a 5 min").
 *
 * Returns null when either timestamp is missing so callers can omit the line.
 */
export function formatRelativeTime(value: DateInput, now: DateInput): string | null {
  const ts = toEpochMs(value);
  const ref = toEpochMs(now);
  if (ts === null || ref === null) {
    return null;
  }
  const diffMs = ref - ts;
  // Future timestamps render as "à l'instant" — the feed is always past-facing.
  if (diffMs < MS_PER_MINUTE) {
    return "à l'instant";
  }
  const absDiff = Math.abs(diffMs);
  if (absDiff < MS_PER_HOUR) {
    return RELATIVE_TIME_FORMATTER.format(-Math.floor(diffMs / MS_PER_MINUTE), 'minute');
  }
  if (absDiff < MS_PER_DAY) {
    return RELATIVE_TIME_FORMATTER.format(-Math.floor(diffMs / MS_PER_HOUR), 'hour');
  }
  if (absDiff < 30 * MS_PER_DAY) {
    return RELATIVE_TIME_FORMATTER.format(-Math.floor(diffMs / MS_PER_DAY), 'day');
  }
  if (absDiff < 365 * MS_PER_DAY) {
    return RELATIVE_TIME_FORMATTER.format(-Math.floor(diffMs / (30 * MS_PER_DAY)), 'month');
  }
  return RELATIVE_TIME_FORMATTER.format(-Math.floor(diffMs / (365 * MS_PER_DAY)), 'year');
}

/**
 * Absolute calendar date. Default is the short numeric form used across the
 * feed ("07/04/2026"); pass `{ style: 'medium' }` for "7 avr. 2026".
 */
export function formatAbsoluteDate(
  value: DateInput,
  options: { style?: 'short' | 'medium' } = {}
): string | null {
  const ms = toEpochMs(value);
  if (ms === null) {
    return null;
  }
  const style = options.style ?? 'short';
  const formatter = style === 'medium' ? MEDIUM_DATE_FORMATTER : SHORT_DATE_FORMATTER;
  return formatter.format(ms);
}

/**
 * Date + time for tracking/activity stamps ("7 avr. 2026, 14:30").
 */
export function formatTimestamp(value: DateInput): string | null {
  const ms = toEpochMs(value);
  if (ms === null) {
    return null;
  }
  return TIMESTAMP_FORMATTER.format(ms);
}

/**
 * Pluralized mission count. French UI convention: plural "s" for n > 1.
 */
export function formatMissionCount(count: number): string {
  const safe = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  return `${safe} mission${safe > 1 ? 's' : ''}`;
}

const STACK_LABELS: Readonly<Record<string, string>> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  'node.js': 'Node.js',
  nodejs: 'Node.js',
  postgresql: 'PostgreSQL',
  graphql: 'GraphQL',
  'next.js': 'Next.js',
  nextjs: 'Next.js',
  aws: 'AWS',
  gcp: 'GCP',
};

export function formatStackLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }
  return (
    STACK_LABELS[normalized.toLowerCase()] ??
    `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
  );
}
