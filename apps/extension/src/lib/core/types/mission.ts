import type { SeniorityLevel } from './profile';
import type { ScoreBreakdown } from './score';

export type MissionSource =
  'free-work' | 'lehibou' | 'hiway' | 'collective' | 'cherry-pick' | 'malt';

export type RemoteType = 'full' | 'hybrid' | 'onsite';

export interface Mission {
  id: string;
  /** Connector identifier before local account scoping. */
  externalId?: string;
  /** Pulse identity that owns the platform binding, when connected. */
  accountId?: string | null;
  /** Active platform account binding used for this scan, when connected. */
  bindingId?: string | null;
  title: string;
  client: string | null;
  description: string;
  stack: string[];
  tjm: number | null;
  /** Borne basse de la fourchette de TJM annoncée, si la source l'expose. */
  tjmMin?: number | null;
  /** Borne haute de la fourchette de TJM annoncée, si la source l'expose. */
  tjmMax?: number | null;
  location: string | null;
  remote: RemoteType | null;
  duration: string | null;
  /** Mission start date (ISO 8601 date string, e.g. "2026-04-01") */
  startDate: string | null;
  /** Date the mission was published on the source platform (ISO 8601) */
  publishedAt: string | null;
  url: string;
  source: MissionSource;
  scrapedAt: Date;
  /** Experience level extracted from the source platform, if available */
  seniority: SeniorityLevel | null;
  /** Structured score breakdown (deterministic + semantic + grade) */
  scoreBreakdown: ScoreBreakdown | null;
  /**
   * Legacy numeric score for backward compatibility.
   * Derived from scoreBreakdown.total.
   * @deprecated Use scoreBreakdown.total instead.
   */
  score: number | null;
  /**
   * Legacy semantic score for backward compatibility.
   * @deprecated Use scoreBreakdown.semantic instead.
   */
  semanticScore: number | null;
  /**
   * Legacy semantic reason for backward compatibility.
   * @deprecated Use scoreBreakdown.semanticReason instead.
   */
  semanticReason: string | null;
}
