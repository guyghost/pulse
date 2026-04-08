import type { SeniorityLevel } from './profile';
import type { ScoreBreakdown } from './score';

export type MissionSource = 'free-work' | 'lehibou' | 'hiway' | 'collective' | 'cherry-pick';

export type RemoteType = 'full' | 'hybrid' | 'onsite';

export interface Mission {
  id: string;
  title: string;
  client: string | null;
  description: string;
  stack: string[];
  tjm: number | null;
  location: string | null;
  remote: RemoteType | null;
  duration: string | null;
  /** Mission start date (ISO 8601 date string, e.g. "2026-04-01") */
  startDate: string | null;
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
