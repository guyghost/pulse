import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import {
  runParserRegression,
  type NormalizedMissionRegression,
} from '../../../src/lib/core/connectors/parser-regression';
import { REGRESSION_REGISTRY } from '../../fixtures/regression/registry';

interface RegressionCase {
  connectorId: string;
  fixturePath: string;
  goldenPath: string;
  now: Date;
  parser: (html: string, now: Date) => unknown;
}

const FIXTURES_ROOT = join(process.cwd(), 'tests/fixtures/regression');
const UPDATE_GOLDENS = process.env.UPDATE_GOLDENS === '1';

function buildCases(): RegressionCase[] {
  return REGRESSION_REGISTRY.flatMap((entry) => {
    const connectorDir = join(FIXTURES_ROOT, entry.fixtureDir);
    const goldenDir = join(connectorDir, 'golden');
    const fixtureFiles = readdirSync(connectorDir)
      .filter((file) => file.endsWith('.html'))
      .sort();

    return fixtureFiles.map((file) => {
      const fixturePath = join(connectorDir, file);
      const goldenPath = join(goldenDir, `${parse(file).name}.json`);
      return {
        connectorId: entry.connectorId,
        fixturePath,
        goldenPath,
        now: entry.now,
        parser: entry.parser,
      };
    });
  });
}

function readGolden(path: string): NormalizedMissionRegression[] {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as NormalizedMissionRegression[];
  } catch (error) {
    throw new Error(`Malformed or missing golden file: ${path}\n${String(error)}`);
  }
}

function writeGolden(path: string, missions: NormalizedMissionRegression[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(missions, null, 2)}\n`);
  console.log(`[parser-regression] regenerated ${path}`);
}

function formatValue(value: unknown): string {
  return JSON.stringify(value);
}

function diffMissions(
  expected: NormalizedMissionRegression[],
  actual: NormalizedMissionRegression[]
): string[] {
  const lines: string[] = [];

  if (expected.length !== actual.length) {
    lines.push(`Mission count changed: expected=${expected.length} actual=${actual.length}`);
  }

  const max = Math.max(expected.length, actual.length);
  for (let index = 0; index < max; index += 1) {
    const expectedMission = expected[index];
    const actualMission = actual[index];

    if (!expectedMission) {
      lines.push(`Mission[${index}] added: ${formatValue(actualMission)}`);
      continue;
    }
    if (!actualMission) {
      lines.push(`Mission[${index}] removed: ${formatValue(expectedMission)}`);
      continue;
    }

    const allKeys = new Set([
      ...Object.keys(expectedMission),
      ...Object.keys(actualMission),
    ] as Array<keyof NormalizedMissionRegression>);

    for (const key of allKeys) {
      const expectedValue = expectedMission[key];
      const actualValue = actualMission[key];
      if (JSON.stringify(expectedValue) !== JSON.stringify(actualValue)) {
        lines.push(
          `Mission[${index}].${String(key)} expected=${formatValue(expectedValue)} actual=${formatValue(actualValue)}`
        );
      }
    }
  }

  return lines;
}

const cases = buildCases();
const summary = { total: cases.length, passed: 0, failed: 0 };

describe('parser regression fixtures', () => {
  it('has at least one registered fixture pair', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const testCase of cases) {
    const fixtureName = parse(testCase.fixturePath).base;

    it(`${testCase.connectorId} parses ${fixtureName}`, () => {
      try {
        const html = readFileSync(testCase.fixturePath, 'utf8');
        const result = runParserRegression(html, testCase.parser, testCase.now);

        if (result.validationErrors.length > 0) {
          throw new Error(
            `Parser validation failed for ${testCase.fixturePath}\n${result.validationErrors.join('\n')}`
          );
        }

        if (UPDATE_GOLDENS) {
          writeGolden(testCase.goldenPath, result.missions);
          summary.passed += 1;
          return;
        }

        const expected = readGolden(testCase.goldenPath);
        const diffs = diffMissions(expected, result.missions);

        if (diffs.length > 0) {
          throw new Error(`Regression detected for ${testCase.fixturePath}\n${diffs.join('\n')}`);
        }

        summary.passed += 1;
      } catch (error) {
        summary.failed += 1;
        throw error;
      }
    });
  }

  afterAll(() => {
    console.log(
      `[parser-regression] total=${summary.total} passed=${summary.passed} failed=${summary.failed}`
    );
  });
});
