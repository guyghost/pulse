/**
 * Local field-proposal generator — Gemini Nano (Chrome built-in AI).
 *
 * Shell module : I/O (AI API), async. Délègue la construction du prompt et le
 * parsing au Core. Aucune décision d'état : produit une proposition ou null.
 *
 * Pattern identique à mission-generator.ts (timeout + retry + destroy).
 */
import type { FieldDescriptor, FieldProposal } from '../../core/form-assistant/types';
import { buildFieldPrompt, parseFieldProposal } from '../../core/form-assistant';
import type { UserProfile } from '../../core/types/profile';
import { createPromptSession, isPromptApiAvailable } from '../ai/capabilities';
import type { AILanguageModelSession } from '../ai/chrome-ai';

const TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [500, 1000] as const;
const MAX_RETRIES = RETRY_DELAYS_MS.length;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Génère une proposition de valeur pour un champ via Gemini Nano.
 * Retourne `null` si l'API est indisponible/non téléchargée, ou si la sortie
 * n'est pas exploitable.
 */
export async function generateFieldProposal(
  field: FieldDescriptor,
  profile: UserProfile
): Promise<FieldProposal | null> {
  const availability = await isPromptApiAvailable();
  if (availability !== 'available') {
    return null;
  }

  const prompt = buildFieldPrompt(field, profile);
  let rawContent: string | null = null;
  let session: AILanguageModelSession | null = null;

  try {
    session = await createPromptSession();

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
            `[FormAssistant] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
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
  return parseFieldProposal(rawContent);
}
