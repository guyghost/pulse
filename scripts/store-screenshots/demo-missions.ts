/**
 * Demo catalogue for store captures.
 *
 * Missions come from the extension's existing parser-regression fixtures
 * (tests/fixtures/regression, the basic fixture of each platform), parsed by the same pure parsers the
 * product uses. One mission per default platform so the un-scrolled feed can
 * show Free-Work, LeHibou, Hiway and Cherry Pick together. Nothing here is a
 * live offer, and no score or count is invented — scores are left null so the
 * extension's own rescore can fill them.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

import { parseCherryPickMissions } from '../../apps/extension/src/lib/core/connectors/cherrypick-parser';
import { parseFreeWorkAPI } from '../../apps/extension/src/lib/core/connectors/freework-parser';
import { parseHiwayJSON } from '../../apps/extension/src/lib/core/connectors/hiway-json-parser';
import { parseLeHibouHTML } from '../../apps/extension/src/lib/core/connectors/lehibou-parser';
import type { Mission } from '../../apps/extension/src/lib/core/types/mission';
import type { UserProfile } from '../../apps/extension/src/lib/core/types/profile';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;

const FIXTURES = resolve(import.meta.dirname, '../../apps/extension/tests/fixtures/regression');

const HIWAY_BASE_URL = 'https://hiway-missions.fr';

export const DEMO_PLATFORMS = ['free-work', 'lehibou', 'hiway', 'cherry-pick'] as const;

export interface DemoCatalogue {
  readonly missions: Mission[];
  readonly profile: UserProfile;
}

function readText(relativePath: string): string {
  return readFileSync(resolve(FIXTURES, relativePath), 'utf8');
}

function firstMission(missions: Mission[], source: string): Mission {
  const mission = missions[0];
  if (!mission) {
    throw new Error(`Regression fixture produced no ${source} mission.`);
  }
  return mission;
}

export function loadDemoCatalogue(): DemoCatalogue {
  const freeWork = firstMission(
    parseFreeWorkAPI(
      JSON.parse(readText('free-work/basic.json')),
      new Date('2026-03-11T12:00:00Z')
    ),
    'free-work'
  );
  const lehibou = firstMission(
    parseLeHibouHTML(readText('lehibou/basic.html'), new Date('2026-03-13T12:00:00Z')),
    'lehibou'
  );
  const hiway = firstMission(
    parseHiwayJSON(
      JSON.parse(readText('hiway/basic.json')),
      new Date('2026-03-15T12:00:00Z'),
      HIWAY_BASE_URL
    ),
    'hiway'
  );
  const cherryPickMissions = parseCherryPickMissions(
    JSON.parse(readText('cherry-pick/basic.json')),
    new Date('2026-03-15T12:00:00Z')
  );
  // The first Cherry Pick row is the same Dev React / Acme offer as the Hiway
  // basic fixture, and the product dedup keeps only one of them. The second
  // basic-fixture row stays distinct, so all four platforms remain in the feed.
  const cherryPick =
    cherryPickMissions.find((mission) => mission.title === 'Lead Java Spring') ??
    firstMission(cherryPickMissions, 'cherry-pick');

  const missions = [freeWork, lehibou, hiway, cherryPick];
  const sources = new Set(missions.map((mission) => mission.source));
  for (const platform of DEMO_PLATFORMS) {
    if (!sources.has(platform)) {
      throw new Error(`Demo catalogue is missing ${platform}.`);
    }
  }

  const keywords: string[] = [];
  const seenKeywords = new Set<string>();
  for (const mission of missions) {
    for (const skill of mission.stack) {
      const key = skill.toLowerCase();
      if (seenKeywords.has(key)) {
        continue;
      }
      seenKeywords.add(key);
      keywords.push(skill);
    }
  }

  const fixtureRates = missions.flatMap((mission) =>
    typeof mission.tjm === 'number' ? [mission.tjm] : []
  );
  const tjmMin = fixtureRates.length > 0 ? Math.min(...fixtureRates) : 0;
  const location =
    missions.find((mission) => mission.location?.includes('Paris'))?.location ??
    missions.find((mission) => mission.location)?.location ??
    '';

  const profile: UserProfile = {
    firstName: 'Exemple',
    keywords: keywords.slice(0, 40),
    tjmMin,
    tjmMax: null,
    location,
    remote: missions.some((mission) => mission.remote === 'hybrid') ? 'hybrid' : 'any',
    seniority: missions.some((mission) => mission.seniority === 'senior') ? 'senior' : 'confirmed',
    jobTitle: missions.find((mission) => mission.title)?.title ?? '',
    experiences: [],
    availability: null,
  };

  return { missions, profile };
}

/** IndexedDB stores dates as strings. The extension deserializes them on read. */
export function serializeMissions(missions: readonly Mission[]): unknown[] {
  return missions.map((mission) => ({
    ...mission,
    scrapedAt:
      mission.scrapedAt instanceof Date ? mission.scrapedAt.toISOString() : mission.scrapedAt,
  }));
}
