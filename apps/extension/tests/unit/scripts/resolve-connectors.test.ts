import { describe, it, expect } from 'vitest';
import {
  parseIdList,
  resolveIncludedConnectors,
  type ConnectorEnv,
} from '../../../scripts/resolve-connectors';

const ALL = ['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick', 'malt'] as const;
const EMPTY_ENV: ConnectorEnv = {};

describe('parseIdList', () => {
  it('returns empty array for undefined', () => {
    expect(parseIdList(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseIdList('')).toEqual([]);
  });

  it('parses single value', () => {
    expect(parseIdList('malt')).toEqual(['malt']);
  });

  it('parses comma-separated values', () => {
    expect(parseIdList('malt,collective,hiway')).toEqual(['malt', 'collective', 'hiway']);
  });

  it('trims whitespace around tokens', () => {
    expect(parseIdList(' malt , collective ,hiway')).toEqual(['malt', 'collective', 'hiway']);
  });

  it('deduplicates tokens', () => {
    expect(parseIdList('malt,malt,collective')).toEqual(['malt', 'collective']);
  });

  it('drops empty tokens', () => {
    expect(parseIdList('malt,,collective,')).toEqual(['malt', 'collective']);
  });
});

describe('resolveIncludedConnectors', () => {
  // ── Default: ship everything ───────────────────────────────────────

  it('ships all connectors when no config and no env', () => {
    const result = resolveIncludedConnectors({ allIds: ALL, env: EMPTY_ENV });
    expect(result.included).toEqual([...ALL]);
    expect(result.excluded).toEqual([]);
    expect(result.source).toBe('all');
    expect(result.warnings).toEqual([]);
  });

  // ── Include sources (absolute lists) ───────────────────────────────

  it('CONNECTORS_INCLUDE env wins over everything', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      config: { exclude: ['hiway'] },
      env: { CONNECTORS_INCLUDE: 'malt,collective' },
    });
    expect(result.included).toEqual(['collective', 'malt']); // allIds ordering preserved
    expect(result.source).toBe('include-env');
  });

  it('config.include is used when no CONNECTORS_INCLUDE env', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      config: { include: ['malt', 'hiway'], exclude: ['hiway'] },
      env: EMPTY_ENV,
    });
    expect(result.included).toEqual(['hiway', 'malt']); // include wins over exclude
    expect(result.source).toBe('include-file');
  });

  // ── Exclude sources (subtractions) ─────────────────────────────────

  it('CONNECTORS_EXCLUDE env subtracts from allIds', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      env: { CONNECTORS_EXCLUDE: 'malt,collective' },
    });
    expect(result.included).toEqual(['free-work', 'lehibou', 'hiway', 'cherry-pick']);
    expect(result.excluded).toEqual(['collective', 'malt']);
    expect(result.source).toBe('exclude-env');
  });

  it('config.exclude subtracts from allIds when no env', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      config: { exclude: ['malt'] },
      env: EMPTY_ENV,
    });
    expect(result.included).toEqual(['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick']);
    expect(result.excluded).toEqual(['malt']);
    expect(result.source).toBe('exclude-file');
  });

  // ── Precedence: include > exclude, env > file ──────────────────────

  it('CONNECTORS_INCLUDE env wins over CONNECTORS_EXCLUDE env', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      env: { CONNECTORS_INCLUDE: 'malt', CONNECTORS_EXCLUDE: 'malt' },
    });
    expect(result.included).toEqual(['malt']);
    expect(result.source).toBe('include-env');
  });

  it('CONNECTORS_EXCLUDE env wins over config.exclude', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      config: { exclude: ['hiway'] },
      env: { CONNECTORS_EXCLUDE: 'malt' },
    });
    expect(result.excluded).toEqual(['malt']);
    expect(result.source).toBe('exclude-env');
  });

  // ── Ordering & filtering ───────────────────────────────────────────

  it('preserves allIds ordering in included list', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      env: { CONNECTORS_INCLUDE: 'malt,free-work,hiway' },
    });
    expect(result.included).toEqual(['free-work', 'hiway', 'malt']);
  });

  it('drops include ids not in allIds', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      env: { CONNECTORS_INCLUDE: 'malt,unknown' },
    });
    expect(result.included).toEqual(['malt']);
  });

  // ── Warnings ───────────────────────────────────────────────────────

  it('warns about unknown ids in CONNECTORS_INCLUDE', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      env: { CONNECTORS_INCLUDE: 'malt,ghost' },
    });
    expect(result.warnings).toContain('Unknown connector id: "ghost"');
  });

  it('warns about unknown ids in CONNECTORS_EXCLUDE', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      env: { CONNECTORS_EXCLUDE: 'malt,phantom' },
    });
    expect(result.warnings).toContain('Unknown connector id: "phantom"');
  });

  it('warns about unknown ids in config.include', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      config: { include: ['malt', ' mirage '] },
      env: EMPTY_ENV,
    });
    // config.include arrays are used as-is (not parsed through parseIdList)
    expect(result.warnings).toContain('Unknown connector id: " mirage "');
  });

  // ── Edge cases ─────────────────────────────────────────────────────

  it('empty allIds yields empty included', () => {
    const result = resolveIncludedConnectors({ allIds: [], env: EMPTY_ENV });
    expect(result.included).toEqual([]);
    expect(result.source).toBe('all');
  });

  it('empty CONNECTORS_INCLUDE string is ignored (falls through)', () => {
    const result = resolveIncludedConnectors({
      allIds: ALL,
      config: { exclude: ['malt'] },
      env: { CONNECTORS_INCLUDE: '' },
    });
    expect(result.source).toBe('exclude-file');
    expect(result.excluded).toEqual(['malt']);
  });

  it('missing env object defaults to empty', () => {
    const result = resolveIncludedConnectors({ allIds: ALL });
    expect(result.included).toEqual([...ALL]);
    expect(result.source).toBe('all');
  });
});
