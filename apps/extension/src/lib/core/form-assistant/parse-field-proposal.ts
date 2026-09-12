import type { FieldProposal } from './types';

const MAX_PROPOSAL_LEN = 4000;

/**
 * Strips markdown fences (```…) that an LLM may add despite instructions.
 * Pure.
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
 * Detects an "empty" sentinel: the LLM may return `""` or `''` (with or
 * without spaces) to signal it has no value. Reject these cases instead of
 * proposing the literal `"\""` text.
 */
function isEmptySentinel(text: string): boolean {
  return /^["'“”‘’\s]*$/.test(text);
}

/**
 * Strips one level of quote wrapping (single, double, or typographic).
 * Some LLMs systematically wrap the proposed value in quotes.
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
 * when empty/invalid.
 *
 * Pure, deterministic, no I/O.
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
