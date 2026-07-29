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
 * Détection d'un sentinelle "vide" : l'LLM peut renvoyer `""` ou `''` (avec ou
 * sans espaces) pour signaler qu'il n'a pas de valeur. On rejette ces cas
 * plutôt que de proposer le texte littéral `"\""`.
 */
function isEmptySentinel(text: string): boolean {
  return /^["'“”‘’\s]*$/.test(text);
}

/**
 * Retire un niveau d'encadrement par des guillemets (simples, doubles, ou
 * typographiques). Certains LLM entourent systématiquement la valeur proposée
 * de guillemets.
 */
function stripSurroundingQuotes(text: string): string {
  if (text.length < 2) {
    return text;
  }
  const first = text[0];
  const last = text[text.length - 1];
  const isPairedQuote =
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === '“' && last === '”') ||
    (first === '‘' && last === '’');
  return isPairedQuote ? text.slice(1, -1) : text;
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
  const stripped = stripCodeFences(raw).trim();
  if (stripped.length === 0 || isEmptySentinel(stripped)) {
    return null;
  }
  const text = stripSurroundingQuotes(stripped).trim();
  if (text.length === 0) {
    return null;
  }
  if (text.length > MAX_PROPOSAL_LEN) {
    return { text: text.slice(0, MAX_PROPOSAL_LEN) };
  }
  return { text };
}
