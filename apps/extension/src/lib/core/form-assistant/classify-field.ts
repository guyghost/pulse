import type { FieldDescriptor, FieldKind, RawFieldInput } from './types';

/**
 * Normalizes text for classification: lowercase, no diacritics,
 * collapsed whitespace. Deterministic (pure).
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

interface KindRule {
  readonly kind: FieldKind;
  readonly keywords: readonly string[];
}

/**
 * Markers indicating an organization/account field, for which a "person name"
 * classification would be a false positive. Evaluated on the normalized text
 * (label + placeholder).
 */
const ORG_USER_MARKERS: readonly string[] = [
  'company',
  'societe',
  'entreprise',
  'organisation',
  'organization',
  'raison sociale',
  'username',
  'utilisateur',
  'login',
  'compte',
  'account',
  'user name',
];

const NAME_KINDS: readonly FieldKind[] = ['first-name', 'last-name', 'full-name'];

function isNameKind(kind: FieldKind): boolean {
  return NAME_KINDS.includes(kind);
}

/**
 * Ordered rules (most specific to most generic).
 * Order matters: "nom de famille" must beat "nom".
 */
const KIND_RULES: readonly KindRule[] = [
  { kind: 'first-name', keywords: ['firstname', 'prenom', 'given name', 'givenname'] },
  {
    kind: 'last-name',
    keywords: ['lastname', 'last name', 'surname', 'nom de famille', 'famille'],
  },
  {
    kind: 'full-name',
    keywords: ['fullname', 'full name', 'votre nom', 'name', 'nom complet', 'complete name'],
  },
  { kind: 'email', keywords: ['email', 'e-mail', 'mail', 'courriel'] },
  {
    kind: 'phone',
    keywords: ['telephone', 'phone', 'mobile', 'portable', 'tel', 'cell'],
  },
  {
    kind: 'linkedin',
    keywords: ['linkedin', 'viadeo', 'lien vers votre profil'],
  },
  {
    kind: 'availability',
    keywords: [
      'disponibilite',
      'disponibilites',
      'disponible',
      'dispo',
      'availability',
      'available',
    ],
  },
  {
    kind: 'tjm',
    keywords: [
      'tjm',
      'tarif journalier',
      'tarif',
      'remuneration',
      'pretention',
      'pretentions salariales',
      'salaire',
      'rate',
      'daily rate',
    ],
  },
  {
    kind: 'skill',
    keywords: ['competence', 'skills', 'stack', 'technologie', 'technologies', 'expertise'],
  },
  {
    kind: 'address',
    keywords: ['adresse', 'address', 'ville', 'city', 'localisation', 'code postal', 'zipcode'],
  },
  {
    kind: 'job-title',
    keywords: [
      'poste',
      'titre du poste',
      'job title',
      'fonction',
      'profession',
      'intitule du poste',
    ],
  },
  {
    kind: 'cover-letter',
    keywords: [
      'lettre',
      'lettre de motivation',
      'cover letter',
      'motivation',
      'message',
      'presentation',
      'a propos',
      'a propos de vous',
      'about you',
      'about',
      'commentaire',
      'comment',
      'pourquoi',
      'why',
    ],
  },
];

/**
 * Detects a field's category from its metadata.
 * `inputType` takes priority for email/tel (strong signal).
 */
function detectKind(raw: RawFieldInput): FieldKind {
  // Signal fort : type d'input DOM.
  if (raw.inputType === 'email') {
    return 'email';
  }
  if (raw.inputType === 'tel') {
    return 'phone';
  }
  if (raw.inputType === 'url') {
    const text = normalize(`${raw.label} ${raw.placeholder}`);
    if (text.includes('linkedin')) {
      return 'linkedin';
    }
  }

  const text = normalize(`${raw.label} ${raw.placeholder}`);
  if (text === '') {
    return 'free-text';
  }

  const isOrgOrUserContext = ORG_USER_MARKERS.some((marker) => text.includes(marker));

  for (const rule of KIND_RULES) {
    for (const keyword of rule.keywords) {
      if (text.includes(keyword)) {
        // Avoid classifying an organization/account field as a person name.
        // E.g. "Nom de l'entreprise", "Username", "Raison sociale".
        if (isOrgOrUserContext && isNameKind(rule.kind)) {
          continue;
        }
        return rule.kind;
      }
    }
  }
  return 'free-text';
}

/**
 * Classifies a raw field into a canonical FieldDescriptor.
 * Pure, deterministic, no I/O.
 */
export function classifyField(raw: RawFieldInput): FieldDescriptor {
  return {
    kind: detectKind(raw),
    label: raw.label,
    placeholder: raw.placeholder,
    inputType: raw.inputType,
    required: raw.required,
  };
}
