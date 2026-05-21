import type { Mission } from '../types/mission';

export interface FavoriteMissionSnapshot {
  missionId: string;
  title: string;
  client: string | null;
  description: string;
  stack: string[];
  tjm: number | null;
  location: string | null;
  remote: string | null;
  duration: string | null;
  startDate: string | null;
  publishedAt: string | null;
  url: string;
  source: string;
  scrapedAt: string;
  score: number | null;
  semanticScore: number | null;
  semanticReason: string | null;
  favoritedAt: string;
}

export function buildFavoriteMissionSnapshot(
  mission: Mission,
  favoritedAt: Date
): FavoriteMissionSnapshot {
  return {
    missionId: mission.id,
    title: mission.title,
    client: mission.client,
    description: mission.description,
    stack: [...mission.stack],
    tjm: mission.tjm,
    location: mission.location,
    remote: mission.remote,
    duration: mission.duration,
    startDate: mission.startDate,
    publishedAt: mission.publishedAt,
    url: mission.url,
    source: mission.source,
    scrapedAt: mission.scrapedAt.toISOString(),
    score: mission.scoreBreakdown?.total ?? mission.score,
    semanticScore: mission.scoreBreakdown?.semantic ?? mission.semanticScore,
    semanticReason: mission.scoreBreakdown?.semanticReason ?? mission.semanticReason,
    favoritedAt: favoritedAt.toISOString(),
  };
}
