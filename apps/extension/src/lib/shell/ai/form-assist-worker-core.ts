import { z } from 'zod';
import type { CapturedFormField, FieldSuggestion } from '@pulse/domain';
import type { UserProfile } from '../../core/types/profile';
import { createPromptSession, isPromptApiAvailable } from './capabilities';

const SuggestionSchema = z
  .object({
    suggestionId: z.string().min(1).max(120),
    fieldId: z.string().min(1).max(160),
    proposedValue: z.string().max(4_000),
    confidence: z.number().min(0).max(1),
    rationale: z.string().max(500),
    sourceRefs: z.array(z.string().min(1).max(160)).max(8),
  })
  .strict();

const SuggestionsSchema = z.array(SuggestionSchema).max(40);

export type FormSuggestionWorkerResult =
  | { ok: true; suggestions: FieldSuggestion[] }
  | { ok: false; error: 'AI_UNAVAILABLE' | 'AI_FAILED' | 'AI_OUTPUT_INVALID' };

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

function buildPrompt(fields: readonly CapturedFormField[], profile: UserProfile): string {
  const profileFacts = {
    firstName: profile.firstName,
    jobTitle: profile.jobTitle,
    location: profile.location,
    remote: profile.remote,
    seniority: profile.seniority,
    tjmMin: profile.tjmMin,
    tjmMax: profile.tjmMax,
    keywords: profile.keywords,
    experiences: profile.experiences.slice(0, 5).map((experience) => ({
      title: experience.title,
      company: experience.company,
      description: experience.description,
      skills: experience.skills,
    })),
  };

  return [
    'Tu es un worker local de suggestion de champs pour un formulaire de candidature.',
    "Tu ne décides d'aucun état, ne soumets rien et n'inventes aucune donnée personnelle.",
    'Réponds uniquement avec un tableau JSON strict conforme au schéma fourni.',
    'Omet tout champ sans réponse suffisamment étayée par les faits du profil.',
    'Chaque suggestion doit citer ses sources avec sourceRefs (ex: profile.jobTitle).',
    'Schéma: [{suggestionId,fieldId,proposedValue,confidence,rationale,sourceRefs}].',
    `Profil: ${JSON.stringify(profileFacts)}`,
    `Champs autorisés: ${JSON.stringify(fields)}`,
  ].join('\n');
}

export async function generateFormFieldSuggestionsInWorker(
  fields: readonly CapturedFormField[],
  profile: UserProfile
): Promise<FormSuggestionWorkerResult> {
  if ((await isPromptApiAvailable()) !== 'available') {
    return { ok: false, error: 'AI_UNAVAILABLE' };
  }

  let session: Awaited<ReturnType<typeof createPromptSession>> | null = null;
  try {
    session = await createPromptSession();
    const raw = await session.prompt(buildPrompt(fields, profile));
    const parsedJson: unknown = JSON.parse(stripCodeFence(raw));
    const parsed = SuggestionsSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return { ok: false, error: 'AI_OUTPUT_INVALID' };
    }

    const allowedIds = new Set(fields.map((field) => field.fieldId));
    const suggestions = parsed.data.filter(
      (suggestion) => allowedIds.has(suggestion.fieldId) && suggestion.proposedValue.length > 0
    );
    return { ok: true, suggestions };
  } catch {
    return { ok: false, error: 'AI_FAILED' };
  } finally {
    session?.destroy();
  }
}
