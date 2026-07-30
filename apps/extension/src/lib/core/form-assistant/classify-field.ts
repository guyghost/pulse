import type { FieldDescriptor, FieldKind, RawFieldInput } from './types';

/**
 * Normalise un texte pour la classification : minuscules, sans diacritiques,
 * espaces collées. Déterministe (pur).
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
 * Marqueurs indiquant un champ d'organisation ou de compte, pour lesquels une
 * classification "nom de personne" serait une fausse positive. Évalués sur le
 * texte normalisé (label + placeholder).
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
 * Règles ordonnées (du plus spécifique au plus générique).
 * L'ordre compte : "nom de famille" doit battre "nom".
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
 * Détecte la catégorie d'un champ à partir de ses métadonnées.
 * L'`inputType` est prioritaire pour email/tel (signal fort).
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
        // Évite de classer un champ d'organisation/compte comme un nom de personne.
        // Ex : "Nom de l'entreprise", "Username", "Raison sociale".
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
 * Classifie un champ brut en FieldDescriptor canonical.
 * Pur, déterministe, sans I/O.
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
