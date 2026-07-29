import type { FieldDescriptor, FieldKind } from './types';
import type { UserProfile } from '../types/profile';

/** Longueur maximale d'une liste injectée dans le prompt (garde-fou). */
const MAX_KEYWORDS = 16;

function joinList(items: readonly string[], max: number): string {
  const slice = items.slice(0, max).filter((item) => item.trim().length > 0);
  return slice.join(', ');
}

function profileLine(profile: UserProfile): string {
  const parts: string[] = [];
  if (profile.firstName) {
    parts.push(`Prénom : ${profile.firstName}`);
  }
  if (profile.jobTitle) {
    parts.push(`Titre : ${profile.jobTitle}`);
  }
  parts.push(`Séniorité : ${profile.seniority}`);
  if (profile.location) {
    parts.push(`Localisation : ${profile.location}`);
  }
  parts.push(`Remote : ${profile.remote}`);
  parts.push(`TJM min : ${profile.tjmMin}€`);
  parts.push(`TJM max : ${profile.tjmMax}€`);
  const keywords = joinList(profile.keywords ?? [], MAX_KEYWORDS);
  if (keywords) {
    parts.push(`Compétences : ${keywords}`);
  }
  return parts.join('\n');
}

function instructionsForKind(kind: FieldKind): string {
  switch (kind) {
    case 'first-name':
      return 'Réponds uniquement par le prénom du profil. Aucune phrase.';
    case 'last-name':
      return 'Réponds uniquement par le nom de famille du profil. Aucune phrase.';
    case 'full-name':
      return 'Réponds uniquement par le nom complet (prénom + nom) du profil. Aucune phrase.';
    case 'email':
    case 'phone':
      // Le profil local ne contient jamais d'email/téléphone (local-first,
      // pas de credentials). On refuse poliment plutôt que d'inventer.
      return 'Ce champ nécessite une coordonnée personnelle absente du profil. Réponds par une chaîne vide : ""';
    case 'linkedin':
      return 'Réponds uniquement par une URL LinkedIn neutre si le profil en indique une, sinon une chaîne vide : ""';
    case 'availability':
      return 'Réponds en une phrase courte sur ta disponibilité (ex : « Disponible immédiatement » ou « Disponible sous 2 semaines »).';
    case 'tjm':
      return 'Réponds uniquement par un TJM en euros cohérent avec la fourchette du profil (ex : « 550 € /jour »).';
    case 'skill':
      return 'Réponds par une liste de compétences séparées par des virgules, déduites du profil et du contexte du champ.';
    case 'address':
      return 'Réponds uniquement par la localisation du profil. Aucune phrase.';
    case 'job-title':
      return 'Réponds uniquement par le titre de poste du profil. Aucune phrase.';
    case 'cover-letter':
      return 'Rédige un court paragraphe (3 à 5 phrases) de présentation/motivation professionnel-le, ton direct et factuel, sans formules convenues, basé sur le profil.';
    case 'free-text':
    default:
      return 'Réponds de façon concise et pertinente au champ, en restant strictement factuel par rapport au profil.';
  }
}

function contextLine(field: FieldDescriptor): string {
  const bits: string[] = [`Champ : ${field.label || '(sans libellé)'}`];
  if (field.placeholder) {
    bits.push(`Placeholder : ${field.placeholder}`);
  }
  bits.push(`Requis : ${field.required ? 'oui' : 'non'}`);
  return bits.join('\n');
}

/**
 * Construit le prompt envoyé au moteur local (Gemini Nano).
 * Pur, déterministe : mêmes entrées ⇒ même prompt. Aucune PII coordonnée
 * (email/téléphone) n'est injectée (le profil n'en contient pas).
 */
export function buildFieldPrompt(field: FieldDescriptor, profile: UserProfile): string {
  return [
    'Tu es un assistant de remplissage de formulaire pour un freelance.',
    'Tu réponds en français, uniquement avec la valeur à saisir dans le champ.',
    'N’invente jamais de coordonnée (email, téléphone) absente du profil.',
    'Si tu ne peux pas répondre factuellement, renvoie une chaîne vide.',
    '',
    '=== Profil ===',
    profileLine(profile),
    '',
    '=== Champ à remplir ===',
    contextLine(field),
    '',
    instructionsForKind(field.kind),
  ].join('\n');
}
