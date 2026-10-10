/**
 * Demo catalogue for store captures.
 *
 * Missions come from the extension's existing parser-regression fixtures
 * (tests/fixtures/regression, the basic fixture of each platform), parsed by the same pure parsers the
 * product uses. One mission per default platform so the un-scrolled feed can
 * show Free-Work, LeHibou, Hiway and Cherry Pick together. Nothing here is a
 * live offer, and no score or count is invented — scores are left null so the
 * extension's own rescore can fill them.
 *
 * Fixture client labels are rewritten here, after parsing, so the captures
 * never show company-shaped names or contact details. The shared fixtures and
 * the extension stay untouched.
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

export interface FieldAudit {
  readonly source: string;
  readonly field: 'title' | 'client' | 'description' | 'location';
  readonly found: string;
  readonly replaced: string | null;
}

export interface DemoCatalogue {
  readonly missions: Mission[];
  readonly profile: UserProfile;
  readonly audit: readonly FieldAudit[];
}

const CLIENT_PLACEHOLDERS: Record<string, string> = {
  'Société ABC': 'Client confidentiel',
  'Acme Corp': 'Scale-up fintech',
  'Tech SA': 'Client confidentiel',
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/g;

function rewriteContacts(value: string): { value: string; replaced: boolean } {
  const next = value
    .replace(EMAIL_PATTERN, '[contact retiré]')
    .replace(PHONE_PATTERN, '[contact retiré]');
  return { value: next, replaced: next !== value };
}

const REDACTED_CONTACT = '[contact retiré]';

function approvedClient(found: string): string {
  const mapped = CLIENT_PLACEHOLDERS[found];
  if (mapped) {
    return mapped;
  }
  const redacted = rewriteContacts(found).value.trim();
  const leftover = redacted.split(REDACTED_CONTACT).join('').trim();
  if (redacted && !leftover) {
    return REDACTED_CONTACT;
  }
  throw new Error(
    `Fixture client ${JSON.stringify(found)} has no approved placeholder. Add one in the capture script before it can appear on a Store screenshot.`
  );
}

function sanitizeMission(mission: Mission, audit: FieldAudit[]): Mission {
  const next: Mission = { ...mission };
  const client = mission.client?.trim() ?? '';
  const approved = client ? approvedClient(client) : null;
  if (approved) {
    next.client = approved;
  }
  audit.push({
    source: mission.source,
    field: 'client',
    found: client,
    replaced: approved,
  });

  for (const field of ['title', 'description', 'location'] as const) {
    const found = mission[field] ?? '';
    if (!found) {
      audit.push({ source: mission.source, field, found: '', replaced: null });
      continue;
    }
    let value = found;
    let replaced = false;
    if (approved && client && value.includes(client)) {
      value = value.split(client).join(approved);
      replaced = true;
    }
    const contacts = rewriteContacts(value);
    value = contacts.value;
    replaced = replaced || contacts.replaced;
    if (field === 'title') {
      next.title = value;
    } else if (field === 'description') {
      next.description = value;
    } else {
      next.location = value;
    }
    audit.push({
      source: mission.source,
      field,
      found,
      replaced: replaced ? value : null,
    });
  }

  return next;
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

  const audit: FieldAudit[] = [];
  const missions = [freeWork, lehibou, hiway, cherryPick].map((mission) =>
    sanitizeMission(mission, audit)
  );
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
    firstName: 'Alex',
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

  return { missions, profile, audit };
}

/** IndexedDB stores dates as strings. The extension deserializes them on read. */
export function serializeMissions(missions: readonly Mission[]): unknown[] {
  return missions.map((mission) => ({
    ...mission,
    scrapedAt:
      mission.scrapedAt instanceof Date ? mission.scrapedAt.toISOString() : mission.scrapedAt,
  }));
}
