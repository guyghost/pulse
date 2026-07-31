import type { FieldDescriptor, RawFieldInput } from './types';
import { classifyField } from './classify-field';

const MAX_LABEL_LEN = 120;
const MAX_PLACEHOLDER_LEN = 200;

// Motifs retirés du texte envoyé à l'IA : URLs, emails, numéros de téléphone.
// On évite ainsi de faire transiter de la PII captée accidentellement dans un
// label ou un placeholder.
const URL_RE = /\bhttps?:\/\/\S+/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

/**
 * Nettoie un texte de métadonnée : retire PII accidentelle, normalise les
 * espaces, plafonne la longueur. Pur.
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
 * Sanitise les métadonnées brutes d'un champ puis le classifie.
 * Le FieldDescriptor retourné est la seule forme autorisée à franchir le
 * bridge vers le service worker / Eve.
 *
 * Pur, déterministe.
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
