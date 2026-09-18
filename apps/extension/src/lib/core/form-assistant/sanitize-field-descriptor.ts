import type { FieldDescriptor, RawFieldInput } from './types';
import { classifyField } from './classify-field';

const MAX_LABEL_LEN = 120;
const MAX_PLACEHOLDER_LEN = 200;

// Patterns stripped from text sent to the AI: URLs, emails, phone numbers.
// This prevents accidentally captured PII in a label or placeholder from
// reaching the model.
const URL_RE = /\bhttps?:\/\/\S+/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

/**
 * Sanitizes a metadata text: strips accidental PII, normalizes whitespace,
 * caps length. Pure.
 */
function sanitizeText(text: string, maxLen: number): string {
  return text
    .replace(URL_RE, '')
    .replace(EMAIL_RE, '')
    .replace(PHONE_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Sanitizes a field's raw metadata then classifies it.
 * The returned FieldDescriptor is the only form allowed to cross the
 * bridge to the service worker / Eve.
 *
 * Pure, deterministic.
 */
export function sanitizeFieldDescriptor(raw: RawFieldInput): FieldDescriptor {
  const label = sanitizeText(raw.label, MAX_LABEL_LEN);
  const placeholder = sanitizeText(raw.placeholder, MAX_PLACEHOLDER_LEN);
  return classifyField({
    label,
    placeholder,
    inputType: raw.inputType,
    required: raw.required,
  });
}
