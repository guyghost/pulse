/**
 * Classification questions — typed declarations for the Jev decision model.
 *
 * Jev evaluates every declared question in parallel against one shared state
 * and returns typed answers (Choice / Boolean) with per-answer probabilities.
 * The objects built here are structurally compatible with the AI SDK
 * `EvaluationQuestion` type, while keeping the Core free of SDK imports.
 *
 * Pure module: no I/O, no async, deterministic truncation.
 */

import type { Mission } from '../types/mission';
import type { MissionCategory } from '../types/mission-classification';

/** Upper bounds keeping the evaluation state small and the cost predictable. */
const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 1500;

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;

// Type aliases (not interfaces) so these objects satisfy the SDK's
// `Record<string, EvaluationQuestion>` constraint via implicit index
// signatures, while keeping `Extract<keyof CRITERIA, string>` typed as
// `MissionCategory` in the answers.
export type CategoryQuestion = {
  readonly type: 'choice';
  readonly instructions: string;
  /** Keys are the choice identifiers — preserved verbatim in the answers. */
  readonly criteria: Readonly<Record<MissionCategory, string>>;
};

export type RemoteCompatibleQuestion = {
  readonly type: 'boolean';
  readonly instructions: string;
  readonly criteria: {
    readonly true: string;
    readonly false: string;
  };
};

export type ClassificationQuestions = {
  readonly category: CategoryQuestion;
  readonly remoteCompatible: RemoteCompatibleQuestion;
};

/**
 * Declare the questions asked about every mission. Choice keys must match
 * `MISSION_CATEGORIES` exactly: the answer's `choice` field is validated
 * against this list before being persisted.
 */
export const buildClassificationQuestions = (): ClassificationQuestions => ({
  category: {
    type: 'choice',
    instructions:
      'Which category best describes the technical or functional domain of this freelance mission?',
    criteria: {
      frontend: 'User-facing web interfaces, client-side frameworks and design systems.',
      backend: 'Server-side logic, APIs, databases and system services.',
      fullstack: 'A balanced mix of front-end and back-end responsibilities.',
      mobile: 'Native or cross-platform mobile applications (iOS, Android).',
      data: 'Data engineering, analytics, machine learning or data science.',
      devops: 'Infrastructure, CI/CD, cloud operations, reliability and security.',
      product: 'Product management, product design strategy, agile coaching.',
      design: 'UI/UX design, user research, visual and interaction design.',
      other: 'Anything that clearly fits none of the categories above.',
    },
  },
  remoteCompatible: {
    type: 'boolean',
    instructions:
      'Could this mission plausibly be performed mostly remotely, based on its description? Answer true only when nothing forces daily on-site presence.',
    criteria: {
      true: 'Remote work is compatible or explicitly offered.',
      false: 'Daily on-site presence is clearly required.',
    },
  },
});

export interface ClassificationState {
  readonly title: string;
  readonly stack: readonly string[];
  /** Scraped remote policy, when the source exposes one. */
  readonly remote: string | null;
  readonly description: string;
}

/**
 * Build the shared evaluation state for one mission. Truncation bounds the
 * payload; the classification only needs enough text to judge the domain and
 * the remote policy.
 */
export const buildClassificationState = (mission: Mission): ClassificationState => ({
  title: truncate(mission.title, TITLE_MAX_LENGTH),
  stack: mission.stack,
  remote: mission.remote,
  description: truncate(mission.description, DESCRIPTION_MAX_LENGTH),
});
