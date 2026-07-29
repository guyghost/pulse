import type { FieldProposal } from './types';

const MAX_PROPOSAL_LEN = 4000;

/**
 * Retire les fences markdown (```…) qu'un LLM peut ajouter malgré la consigne.
 * Pur.
 */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }
  const firstNewline = trimmed.indexOf('\n');
  const body = firstNewline === -1 ? '' : trimmed.slice(firstNewline + 1);
  return body.replace(/\s*```$/, '').trim();
}

/**
 * Transforme la sortie brute d'un LLM en FieldProposal canonical, ou `null`
 * si vide/invalide.
 *
 * Pur, déterministe, sans I/O.
 */
export function parseFieldProposal(raw: string): FieldProposal | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = stripCodeFences(raw).trim();
  if (text.length === 0) {
    return null;
  }
  if (text.length > MAX_PROPOSAL_LEN) {
    return { text: text.slice(0, MAX_PROPOSAL_LEN) };
  }
  return { text };
}
