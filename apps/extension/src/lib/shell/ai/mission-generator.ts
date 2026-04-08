/**
 * Mission Generator — generates assets (pitch, cover message, CV summary) using Gemini Nano.
 *
 * Shell module: I/O (AI API calls), async.
 * Delegates prompt building to core/generation/.
 */

import type { Mission } from '../../core/types/mission';
import type { UserProfile } from '../../core/types/profile';
import type { GeneratedAsset, GenerationType } from '../../core/types/generation';
import { buildPitchPrompt } from '../../core/generation/build-pitch-prompt';
import { buildCoverMessagePrompt } from '../../core/generation/build-cover-message';
import { buildCvSummaryPrompt } from '../../core/generation/build-cv-summary';
import { cleanGenerationOutput, isValidGeneration } from '../../core/generation/parse-generation-result';
import { isPromptApiAvailable } from './capabilities';
import type { AILanguageModelSession } from './chrome-ai';

const TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [500, 1000] as const;
const MAX_RETRIES = RETRY_DELAYS_MS.length;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build the appropriate prompt based on generation type.
 */
const buildPrompt = (
  type: GenerationType,
  mission: Mission,
  profile: UserProfile
): string => {
  switch (type) {
    case 'pitch':
      return buildPitchPrompt(mission, profile, mission.scoreBreakdown);
    case 'cover-message':
      return buildCoverMessagePrompt(mission, profile);
    case 'cv-summary':
      return buildCvSummaryPrompt(mission, profile);
  }
};

/**
 * Generate a single asset for a mission.
 */
export const generateAsset = async (
  missionId: string,
  type: GenerationType,
  mission: Mission,
  profile: UserProfile
): Promise<GeneratedAsset | null> => {
  const availability = await isPromptApiAvailable();
  if (availability === 'no') {
    return null;
  }

  const prompt = buildPrompt(type, mission, profile);
  let rawContent: string | null = null;
  let session: AILanguageModelSession | null = null;

  try {
    session = await self.ai.languageModel.create();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await Promise.race<string>([
          session.prompt(prompt),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
          ),
        ]);

        rawContent = response;
        break;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn(
            `[MissionGenerator] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
            error instanceof Error ? error.message : error
          );
        }

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
    }
  } finally {
    session?.destroy();
  }

  if (!rawContent) {
    return null;
  }

  const content = cleanGenerationOutput(rawContent);

  if (!isValidGeneration(content)) {
    return null;
  }

  const now = Date.now();
  return {
    id: `gen-${type}-${missionId}-${now}`,
    missionId,
    type,
    content,
    createdAt: now,
    modelUsed: 'gemini-nano',
  };
};
