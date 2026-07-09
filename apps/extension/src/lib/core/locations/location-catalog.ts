/**
 * Offline location catalog — display + suggestion layer for the profile
 * `location` field.
 *
 * Pure data: no I/O, no async, no side effects. Consumed by the onboarding
 * and profile-edit inputs via a native `<datalist>` so user input converges on
 * the canonical vocabulary that `core/scoring/location-matching.ts` already
 * understands. This module does NOT change the scoring algorithm — it only
 * biases what the user types. See `models/location-completion.model.md`.
 *
 * @module location-catalog
 */

/**
 * A single suggestible place.
 *
 * `label` is the human-readable, accented, proper-case string shown in the
 * datalist and written into `UserProfile.location` when selected.
 *
 * `aliases` are the normalized forms (lowercase, unaccented, hyphens → spaces)
 * used for matching user typing against an entry. Each entry must include at
 * least its own canonical name as an alias, plus a department code where
 * relevant.
 */
export interface LocationEntry {
  readonly label: string;
  readonly aliases: readonly string[];
  readonly metro?: string;
}

/**
 * Normalize a label into the alias form used by this catalog and by the derived
 * scoring tables.
 *
 * Mirrors the normalization rules of `normalizeLocation` in
 * `core/scoring/location-matching.ts` (lowercase, strip accents, hyphens →
 * spaces, collapse whitespace) so aliases line up with what the scorer sees.
 * For every string that appears in this catalog (clean labels and department
 * codes), this function and the scorer's `normalizeLight` agree byte for byte,
 * so derived cache keys are stable. Exported so the derivation module reuses
 * the single normalizer rather than re-implementing it.
 *
 * Kept pure and dependency-free: this module must not import the scoring
 * module (that would invert the data/algorithm boundary).
 */
export const normalizeLocationAlias = (label: string): string =>
  label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[œæ]/g, (m) => (m === 'œ' ? 'oe' : 'ae'))
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Build an entry. `extraAliases` let a place declare department codes and
 * common alternate spellings without re-listing the canonical name (it is
 * added automatically and normalized).
 */
const entry = (
  label: string,
  extraAliases: readonly string[] = [],
  metro?: string
): LocationEntry => {
  const aliases = [label, ...extraAliases].map(normalizeLocationAlias).filter((a) => a.length > 0);
  // Deduplicate aliases while preserving order.
  const seen = new Set<string>();
  const unique = aliases.filter((a) => (seen.has(a) ? false : (seen.add(a), true)));
  return { label, aliases: unique, metro };
};

/**
 * The suggestible places, ordered roughly by relevance (major metros first,
 * then regional capitals, then remote variants).
 *
 * Derived from `REGION_SYNONYMS` and `METRO_AREAS` in `location-matching.ts`
 * and augmented with French regional capitals absent from the synonym table.
 */
export const LOCATION_CATALOG: readonly LocationEntry[] = [
  // ── Major metropolitan areas ──────────────────────────────────────────
  entry(
    'Paris',
    ['75', 'Île-de-France', 'IDF', 'Région parisienne', 'Paris 75', 'Paris 1er'],
    'paris'
  ),
  entry('Lyon', ['69', 'Rhône', 'Métropole lyonnaise'], 'lyon'),
  entry('Marseille', ['13', 'Bouches-du-Rhône'], 'marseille'),
  entry('Bordeaux', ['33', 'Gironde'], 'bordeaux'),
  entry('Toulouse', ['31', 'Haute-Garonne'], 'toulouse'),
  entry('Nantes', ['44', 'Loire-Atlantique']),
  entry('Lille', ['59', 'Nord']),
  entry('Nice', ['06', 'Alpes-Maritimes']),
  entry('Strasbourg', ['67', 'Bas-Rhin']),

  // ── Île-de-France / Paris suburbs (petite + grande couronne) ───────────
  entry('Nanterre', ['92'], 'paris'),
  entry('Boulogne-Billancourt', ['92'], 'paris'),
  entry('La Défense', ['92'], 'paris'),
  entry('Neuilly-sur-Seine', ['92'], 'paris'),
  entry('Saint-Denis', ['93'], 'paris'),
  entry('Montreuil', ['93'], 'paris'),
  entry('Créteil', ['94'], 'paris'),
  entry('Vincennes', ['94'], 'paris'),
  entry('Levallois-Perret', ['92'], 'paris'),
  entry('Issy-les-Moulineaux', ['92'], 'paris'),
  entry('Courbevoie', ['92'], 'paris'),
  entry('Puteaux', ['92'], 'paris'),
  entry('Clichy', ['92'], 'paris'),
  entry('Colombes', ['92'], 'paris'),
  entry('Villejuif', ['94'], 'paris'),
  entry('Ivry-sur-Seine', ['94'], 'paris'),
  entry('Bobigny', ['93'], 'paris'),
  entry('Pantin', ['93'], 'paris'),
  entry('Aubervilliers', ['93'], 'paris'),
  entry('Noisy-le-Grand', ['93'], 'paris'),
  entry('Rueil-Malmaison', ['92'], 'paris'),
  entry('Antony', ['92'], 'paris'),
  entry('Clamart', ['92'], 'paris'),
  entry('Sevran', ['93'], 'paris'),
  entry('Aulnay-sous-Bois', ['93'], 'paris'),
  entry('Saint-Ouen', ['93'], 'paris'),
  entry('Gennevilliers', ['92'], 'paris'),
  entry('Asnières-sur-Seine', ['92'], 'paris'),
  entry('Suresnes', ['92'], 'paris'),
  entry('Meudon', ['92'], 'paris'),
  entry('Malakoff', ['92'], 'paris'),
  entry('Châtillon', ['92'], 'paris'),
  entry('Bagneux', ['92'], 'paris'),
  entry('Fontenay-sous-Bois', ['94'], 'paris'),
  entry('Nogent-sur-Marne', ['94'], 'paris'),
  entry('Saint-Mandé', ['94'], 'paris'),
  entry('Charenton-le-Pont', ['94'], 'paris'),
  entry('Maisons-Alfort', ['94'], 'paris'),
  entry('Vitry-sur-Seine', ['94'], 'paris'),
  entry('Versailles', ['78'], 'paris'),
  entry('Saint-Quentin-en-Yvelines', ['78'], 'paris'),
  entry('Évry', ['91'], 'paris'),
  entry('Marne-la-Vallée', ['77'], 'paris'),
  entry('Cergy', ['95'], 'paris'),
  entry('Argenteuil', ['95'], 'paris'),

  // ── Lyon metro ────────────────────────────────────────────────────────
  entry('Villeurbanne', ['69'], 'lyon'),
  entry('Vénissieux', ['69'], 'lyon'),
  entry('Vaulx-en-Velin', ['69'], 'lyon'),
  entry('Bron', ['69'], 'lyon'),
  entry('Saint-Priest', ['69'], 'lyon'),
  entry('Caluire-et-Cuire', ['69'], 'lyon'),
  entry('Écully', ['69'], 'lyon'),
  entry('Oullins', ['69'], 'lyon'),
  entry('Tassin-la-Demi-Lune', ['69'], 'lyon'),
  entry('Rillieux-la-Pape', ['69'], 'lyon'),
  entry('Meyzieu', ['69'], 'lyon'),
  entry('Décines-Charpieu', ['69'], 'lyon'),

  // ── Marseille / Aix metro ─────────────────────────────────────────────
  entry('Aix-en-Provence', ['13'], 'marseille'),
  entry('Aubagne', ['13'], 'marseille'),
  entry('Martigues', ['13'], 'marseille'),
  entry('Vitrolles', ['13'], 'marseille'),
  entry('Salon-de-Provence', ['13'], 'marseille'),
  entry('La Ciotat', ['13'], 'marseille'),
  entry('Istres', ['13'], 'marseille'),
  entry('Gardanne', ['13'], 'marseille'),
  entry('Miramas', ['13'], 'marseille'),

  // ── Bordeaux metro ────────────────────────────────────────────────────
  entry('Mérignac', ['33'], 'bordeaux'),
  entry('Pessac', ['33'], 'bordeaux'),
  entry('Talence', ['33'], 'bordeaux'),
  entry('Bègles', ['33'], 'bordeaux'),
  entry('Cenon', ['33'], 'bordeaux'),
  entry('Gradignan', ['33'], 'bordeaux'),
  entry("Villenave-d'Ornon", ['33'], 'bordeaux'),
  entry('Le Bouscat', ['33'], 'bordeaux'),
  entry('Bruges', ['33'], 'bordeaux'),
  entry('Blanquefort', ['33'], 'bordeaux'),
  entry('Floirac', ['33'], 'bordeaux'),
  entry('Lormont', ['33'], 'bordeaux'),
  entry('Carbon-Blanc', ['33'], 'bordeaux'),

  // ── Toulouse metro ────────────────────────────────────────────────────
  entry('Blagnac', ['31'], 'toulouse'),
  entry('Colomiers', ['31'], 'toulouse'),
  entry('Tournefeuille', ['31'], 'toulouse'),
  entry('Balma', ['31'], 'toulouse'),
  entry('Ramonville-Saint-Agne', ['31'], 'toulouse'),
  entry('Muret', ['31'], 'toulouse'),
  entry('Cugnaux', ['31'], 'toulouse'),
  entry("L'Union", ['31'], 'toulouse'),
  entry('Castanet-Tolosan', ['31'], 'toulouse'),
  entry('Saint-Orens-de-Gameville', ['31'], 'toulouse'),
  entry('Fenouillet', ['31'], 'toulouse'),

  // ── Regional capitals (France) ────────────────────────────────────────
  entry('Rennes', ['35', 'Bretagne', 'Ille-et-Vilaine']),
  entry('Montpellier', ['34', 'Hérault']),
  entry('Grenoble', ['38', 'Isère']),
  entry('Clermont-Ferrand', ['63', 'Puy-de-Dôme']),
  entry('Dijon', ['21', "Côte-d'Or"]),
  entry('Tours', ['37', 'Indre-et-Loire']),
  entry('Saint-Étienne', ['42', 'Loire']),
  entry('Le Mans', ['72', 'Sarthe']),
  entry('Amiens', ['80', 'Somme']),
  entry('Rouen', ['76', 'Seine-Maritime']),
  entry('Caen', ['14', 'Calvados']),
  entry('Metz', ['57', 'Moselle']),
  entry('Nancy', ['54', 'Meurthe-et-Moselle']),
  entry('Limoges', ['87', 'Haute-Vienne']),
  entry('Annecy', ['74', 'Haute-Savoie']),
  entry('Brest', ['29', 'Finistère']),
  entry('Reims', ['51', 'Marne']),
  entry('Orléans', ['45', 'Loiret']),
  entry('Toulon', ['83', 'Var']),
  entry('Perpignan', ['66', 'Pyrénées-Orientales']),
  entry('Besançon', ['25', 'Doubs']),
  entry('Angers', ['49', 'Maine-et-Loire']),
  entry('Poitiers', ['86', 'Vienne']),
  entry('La Rochelle', ['17', 'Charente-Maritime']),
  entry('Nîmes', ['30', 'Gard']),
  // Dunkerque is a secondary city of the Nord (59) department. Department
  // codes belong to the regional capital (Lille) to avoid rebinding '59' /
  // 'nord' away from 'lille' in the scorer's synonym cache — see
  // `models/location-tables-derivation.model.md` invariant #2. Dunkerque
  // stays suggestible by name.
  entry('Dunkerque'),
  entry('Avignon', ['84', 'Vaucluse']),
  entry('La Réunion', ['974']),
  entry('Guadeloupe', ['971']),
  entry('Martinique', ['972']),
  entry('Guyane', ['973']),
  entry('Mayotte', ['976']),

  // ── Remote variants (kept as places so the datalist offers them) ──────
  entry('Remote', [
    'Télétravail',
    'Full remote',
    'Distanciel',
    'À distance',
    'Home office',
    '100% Remote',
  ]),
];

/**
 * Flat list of all datalist option labels, in catalog order. The UI renders
 * one `<option>` per label. Kept memoizable: the catalog is immutable.
 */
export const LOCATION_LABELS: readonly string[] = LOCATION_CATALOG.map((e) => e.label);

/**
 * Resolve a raw user-typed string to the best catalog label, or `null` when
 * nothing matches. Pure — intended for future use by the scoring layer and by
 * tests; the datalist itself does not need it (native matching is label-only).
 *
 * Matching is alias-based: a typed value whose normalized form matches any
 * alias resolves to that entry's label. Exact normalized-label matches win.
 */
export const resolveLocationLabel = (input: string): string | null => {
  const normalized = normalizeLocationAlias(input);
  if (!normalized) {
    return null;
  }
  // Prefer exact label match.
  for (const e of LOCATION_CATALOG) {
    if (normalizeLocationAlias(e.label) === normalized) {
      return e.label;
    }
  }
  // Then alias match.
  for (const e of LOCATION_CATALOG) {
    if (e.aliases.includes(normalized)) {
      return e.label;
    }
  }
  return null;
};
