/**
 * Local field-proposal generator — Gemini Nano (Chrome built-in AI).
 *
 * Shell module : I/O (AI API), async. Délègue la construction du prompt et le
 * parsing au Core. Aucune décision d'état : produit une proposition ou null.
 *
 * Pattern identique à semantic-scorer.ts (timeout + retry + AbortSignal +
 * destroy). Un cache mémoire borné évite de ré-invoquer le modèle pour le même
 * champ/profil lors d'un re-focus ou d'une nouvelle proposition.
 */
import type { FieldDescriptor, FieldProposal } from '../../core/form-assistant/types';
import { buildFieldPrompt, parseFieldProposal } from '../../core/form-assistant';
import type { UserProfile } from '../../core/types/profile';
import { createPromptSession, isPromptApiAvailable } from '../ai/capabilities';
import type { AILanguageModelSession } from '../ai/chrome-ai';
import { abortableDelay } from '../utils/retry-strategy';

const TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [500, 1000] as const;
const MAX_RETRIES = RETRY_DELAYS_MS.length;

/** Nombre maximal d'entrées du cache mémoire (garde-fou). */
const MAX_CACHE_ENTRIES = 64;

interface CacheKey {
  readonly fingerprint: string;
}

interface CacheEntry {
  readonly value: FieldProposal | null;
}

const cache = new Map<string, CacheEntry>();

function fieldFingerprint(field: FieldDescriptor): string {
  return [
    field.kind,
    field.label ?? '',
    field.placeholder ?? '',
    field.inputType ?? '',
    field.required ? '1' : '0',
  ].join('|');
}

function profileFingerprint(profile: UserProfile): string {
  return [
    profile.firstName ?? '',
    profile.jobTitle ?? '',
    profile.seniority,
    profile.location ?? '',
    profile.remote,
    String(profile.tjmMin),
    String(profile.tjmMax),
    (profile.keywords ?? []).join(','),
    profile.availability ? JSON.stringify(profile.availability) : '',
  ].join('|');
}

function getCache(key: CacheKey): FieldProposal | null | undefined {
  const entry = cache.get(key.fingerprint);
  return entry?.value;
}

function setCache(key: CacheKey, value: FieldProposal | null): void {
  cache.set(key.fingerprint, { value });
  // Éviction FIFO quand la borne est dépassée.
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done && oldest.value !== key.fingerprint) {
      cache.delete(oldest.value as string);
    }
  }
}

/**
 * Invalide tout le cache de propositions. À appeler quand le profil change.
 */
export function clearFieldProposalCache(): void {
  cache.clear();
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

function promptWithCancellation(
  session: AILanguageModelSession,
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };
    const settle = (callback: () => void): void => {
      cleanup();
      callback();
    };
    const onAbort = (): void =>
      settle(() => reject(new DOMException('The operation was aborted.', 'AbortError')));
    const timeout = setTimeout(() => settle(() => reject(new Error('timeout'))), TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    session.prompt(prompt).then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error))
    );
  });
}

/**
 * Génère une proposition de valeur pour un champ via Gemini Nano.
 * Retourne `null` si l'API est indisponible/non téléchargée, ou si la sortie
 * n'est pas exploitable. Honore un `AbortSignal` (annulation cohérente avec la
 * Machine A du modèle `form-assistant`).
 */
export async function generateFieldProposal(
  field: FieldDescriptor,
  profile: UserProfile,
  signal?: AbortSignal
): Promise<FieldProposal | null> {
  throwIfAborted(signal);

  const key: CacheKey = {
    fingerprint: `${fieldFingerprint(field)}::${profileFingerprint(profile)}`,
  };
  const cached = getCache(key);
  if (cached !== undefined) {
    return cached;
  }

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
        const response = await promptWithCancellation(session, prompt, signal);
        throwIfAborted(signal);
        rawContent = response;
        break;
      } catch (error) {
        throwIfAborted(signal);
        if (import.meta.env.DEV) {
          console.warn(
            `[FormAssistant] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
            error instanceof Error ? error.message : error
          );
        }
        if (attempt < MAX_RETRIES) {
          await abortableDelay(RETRY_DELAYS_MS[attempt], signal);
        }
      }
    }
  } finally {
    session?.destroy();
  }

  throwIfAborted(signal);
  if (!rawContent) {
    setCache(key, null);
    return null;
  }
  const proposal = parseFieldProposal(rawContent);
  setCache(key, proposal);
  return proposal;
}
