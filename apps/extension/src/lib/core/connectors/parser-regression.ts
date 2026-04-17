import type { Mission } from '../types/mission';
import type { SeniorityLevel } from '../types/profile';

export interface NormalizedMissionRegression {
  id: string;
  title: string;
  client: string | null;
  stack: string[];
  tjm: number | null;
  location: string | null;
  remote: Mission['remote'];
  duration: string | null;
  url: string;
  source: Mission['source'];
  scrapedAt: string;
  startDate: string | null;
  seniority: SeniorityLevel | null;
  publishedAt: string | null;
}

export interface ParserRegressionResult {
  missions: NormalizedMissionRegression[];
  validationErrors: string[];
}

export function normalizeMissionForRegression(mission: Mission): NormalizedMissionRegression {
  return {
    id: mission.id,
    title: mission.title,
    client: mission.client,
    stack: [...mission.stack],
    tjm: mission.tjm,
    location: mission.location,
    remote: mission.remote,
    duration: mission.duration,
    url: mission.url,
    source: mission.source,
    scrapedAt: mission.scrapedAt.toISOString(),
    startDate: mission.startDate,
    seniority: mission.seniority ?? null,
    publishedAt: mission.publishedAt ?? null,
  };
}

export function validateRegressionMissions(missions: NormalizedMissionRegression[]): string[] {
  const errors: string[] = [];

  if (missions.length === 0) {
    errors.push('Parser returned 0 missions');
    return errors;
  }

  missions.forEach((mission, index) => {
    if (!mission.id.trim()) {
      errors.push(`Mission[${index}] missing id`);
    }
    if (!mission.title.trim()) {
      errors.push(`Mission[${index}] missing title`);
    }
    if (!mission.url.trim()) {
      errors.push(`Mission[${index}] missing url`);
    }
    if (!mission.source.trim()) {
      errors.push(`Mission[${index}] missing source`);
    }
  });

  return errors;
}

export function runParserRegression(
  html: string,
  parser: (html: string, now: Date) => Mission[],
  now: Date
): ParserRegressionResult {
  const missions = parser(html, now).map(normalizeMissionForRegression);
  const validationErrors = validateRegressionMissions(missions);
  return { missions, validationErrors };
}
