# Modèle de complétion de localisation

Source de vérité pour l'**autocomplétion hors ligne** du champ `location` du
profil. Compagnon de `onboarding-workmode-location.model.md` (qui définit ce
que l'onboarding _collecte_) et de `core/scoring/location-matching.ts` (qui
_consomme_ la valeur normalisée). Ce changement fait converger la saisie
utilisateur vers le vocabulaire canonique que le scorer comprend déjà — il
n'ajoute **pas** de géolocalisation, de permissions ou d'appels réseau.

## Problème

`UserProfile.location` est une chaîne en texte libre collectée à deux endroits :

- `OnboardingWizard.svelte` — champ `ob-location` (placeholder `Paris, Lyon, Bordeaux…`).
- `ProfileSection.svelte` — champ `profileLocation` (placeholder `Localisation`).

Tous deux alimentent `core/scoring/location-matching.ts::matchLocation(missionLoc, profileLoc)`,
qui ne reconnaît qu'un ensemble figé de noms canoniques, de synonymes régionaux
(`paris ↔ 75 ↔ ile de france`) et d'aires métropolitaines (`nanterre → paris`).

Comme la saisie n'est pas contrainte, les utilisateurs tapent ce qu'une annonce de
mission leur a affiché : fautes de frappe, casse variable, variantes accentuées,
banlieues ou noms de régions que la table de synonymes ne couvre pas. Résultat :
`matchLocation` retourne `'none'` ou `'partial'` pour des saisies qui sont
_sémantiquement_ correctes, et le poids de localisation (`DEFAULT_SCORING_WEIGHTS.location = 20`)
contribue silencieusement à hauteur de 0. Le problème de précision est un
**problème de vocabulaire**, pas un problème de coordonnées.

## Objectif

Guider l'utilisateur vers des toponymes canoniques avec un **`<datalist>` hors
ligne** adossé à un catalogue pur. Pas de permission de géolocalisation, pas de
géocodage inverse, pas de backend, pas de nouveaux types de messages, pas de
changement de schéma. `location` reste une simple chaîne (`string`) ; le
catalogue oriente uniquement _ce que_ l'utilisateur saisit.

## Hors périmètre

- Pas de permission `geolocation` et aucun appel à `navigator.geolocation`. Le
  GPS renvoie des coordonnées ; les missions comportent des _noms_ de villes,
  la géolocalisation nécessiterait donc un géocodeur inverse (réseau ou lourde
  base de données hors ligne) — rejeté par le principe local-first. Voir
  `onboarding-workmode-location.model.md` « Hors périmètre ».
- Aucune modification de la structure de `UserProfile`, des messages du bridge
  ou de la persistance.
- Aucune modification de `relevance.ts`, `DEFAULT_SCORING_WEIGHTS` ou de
  l'**algorithme** `matchLocation`. (Le catalogue est une source de données ;
  faire en sorte que `location-matching.ts` le consomme est une suite explicite,
  voir « Évolutions futures ».)
- Pas de composant combobox personnalisé. Uniquement le `<datalist>` natif —
  accessible, adapté au clavier, sans état, avec un coût d'exécution JS nul.

## Source de données — `core/locations/location-catalog.ts`

Nouveau module pur. Zéro I/O, zéro async, zéro side effect — couvert par le seuil
de couverture sans mocks de `src/lib/core/**`.

```ts
export interface LocationEntry {
  /** Display label shown in the datalist, proper case with accents. */
  readonly label: string;
  /** Normalized forms (lowercase, unaccented) that should match this entry. */
  readonly aliases: readonly string[];
  /** Optional metro area the entry belongs to (informational). */
  readonly metro?: string;
}

export const LOCATION_CATALOG: readonly LocationEntry[];
```

### Règles d'initialisation (seeding)

1. **Dériver, ne pas dupliquer.** La graine initiale est générée à partir des
   `REGION_SYNONYMS` et `METRO_AREAS` existants dans `location-matching.ts`, puis
   enrichie avec les capitales régionales françaises manquantes (Rennes,
   Montpellier, Grenoble, Clermont-Ferrand, Dijon, Tours, Saint-Étienne, Le Mans,
   Aix-en-Provence, Amiens, Rouen, Caen, Metz, Nancy, Limoges, Annecy, Brest,
   Reims, Orléans, Toulon, Perpignan, Besançon, Angers, Poitiers, La Rochelle,
   etc.).
2. **Les libellés sont lisibles par un humain.** Casse appropriée + accents
   (`Île-de-France`, `Aix-en-Provence`, `Charenton-le-Pont`).
3. **Les alias sont normalisés** selon les mêmes règles que `normalizeLocation`
   (minuscules, sans accents, tirets → espaces). Chaque entrée doit inclure au
   moins son nom canonique + son code départemental le cas échéant.
4. **Dédupliqués par libellé.** Deux entrées ne doivent pas partager le même
   libellé ; les alias peuvent se chevaucher (ce qui convient pour l'affichage).
5. **Taille cible : ~120–160 entrées** (capitales régionales + codes de
   départements + les banlieues métropolitaines existantes). Maintient le
   `<datalist>` réactif et le bundle léger ; pas besoin d'embarquer les 36 000
   communes françaises.

> Le catalogue est une couche d'_affichage et de suggestion_. Il s'agit
> délibérément d'une constante distincte de `REGION_SYNONYMS` / `METRO_AREAS`
> afin que cette modification ne perturbe pas le scorer. Une étape ultérieure
> pourra faire en sorte que `location-matching.ts` dérive ses tables du
> catalogue.

## Surface UI

Chaque surface effectue le rendu de son **propre** `<datalist>` avec un `id`
spécifique à la surface, et son champ de saisie y fait référence via `list=` :

- `OnboardingWizard.svelte` → champ `ob-location` avec
  `list="ob-location-catalog"` et `<datalist id="ob-location-catalog">`.
- `ProfileSection.svelte` → champ `profileLocation` avec
  `list="profile-location-catalog"` et
  `<datalist id="profile-location-catalog">` (rendu uniquement en mode édition).

Le comportement natif du navigateur prend en charge le filtrage, la navigation au
clavier (↑/↓) et la sélection. La valeur textuelle reste entièrement modifiable —
le datalist est une _indication_ (hint), jamais une contrainte. L'état lié
(`location` / `profileLocation`) est inchangé ; la sélection d'une suggestion y
écrit simplement le `label` de l'entrée.

Puisque `<datalist>` est un registre au niveau du document indexé par `id`, et
que les deux surfaces peuvent être montées simultanément dans le DOM du side panel,
chaque surface utilise un identifiant distinct (`ob-location-catalog` /
`profile-location-catalog`) plutôt qu'un identifiant partagé unique. Un identifiant
partagé entrerait en collision lorsque les deux champs sont montés en même temps ;
les identifiants par surface maintiennent les listes de suggestions indépendantes
et évitent les violations d'identifiants dupliqués dans le DOM.

## États

Pas de nouvelle machine à états. L'état local du champ de localisation existe
déjà dans le modèle compagnon (`onboarding-workmode-location.model.md`) :

```
location:  untouched ('') ──input/select──► filled (string) ──clear──► untouched
```

Le datalist n'ajoute aucun état propre : il s'agit d'une source de suggestions sans
état. Sélectionner une suggestion est simplement un événement `input` qui écrit
`entry.label`.

## Événements

| Événement        | Source                            | Effet                                                       |
| ---------------- | --------------------------------- | ----------------------------------------------------------- |
| `LOCATION_INPUT` | saisie texte / sélection datalist | `location` (ou `profileLocation`) mis à jour avec la valeur |

Pas de nouveaux types d'événements. Les flux `SUBMIT` / sauvegarde de profil sont inchangés.

## Flux de données

```
LOCATION_CATALOG (données pures, core/locations/)
   │
   ▼
<datalist id="location-catalog">   ← rendu à côté de chaque champ de localisation
   │  list="location-catalog"
   ▼
<input bind:value={location | profileLocation}>
   │  SUBMIT / save (inchangé)
   ▼
UserProfile.location (string, forme inchangée)
   │
   ▼
matchLocation(mission.location, profile.location)   ← algorithme inchangé
```

Le sens respecte la règle architecturale : **l'UI importe Core ; Core n'importe
jamais l'UI.** Le catalogue est constitué de données pures dans `core/` ; les
surfaces Svelte l'importent.

## Invariants

1. **Local-first.** Aucune permission `geolocation` ajoutée à `manifest.json`,
   aucun appel réseau, aucune dépendance tierce. La complétion est 100 % hors
   ligne.
2. **Schéma stable.** `UserProfile.location` reste une chaîne (`string`). Pas de
   migration de base de données, pas de modification de préprocesseur, aucun
   message bridge ajouté.
3. **Scoring stable.** `matchLocation`, `relevance.ts` et
   `DEFAULT_SCORING_WEIGHTS` sont inchangés. La précision s'améliore
   _uniquement_ parce que la saisie utilisateur converge vers des libellés
   canoniques.
4. **Catalogue pur.** `location-catalog.ts` n'a aucune I/O, aucun async, aucun
   `Date`/`Math.random`, aucun `console`. Il est testé unitairement sans mocks
   et relève du seuil de couverture de `src/lib/core/**`.
5. **Indication, non contrainte.** Le champ reste en texte libre. Un utilisateur
   peut saisir une valeur absente du catalogue ; elle est stockée textuellement
   et scorée comme aujourd'hui.
6. **Unicité des libellés.** Deux `LocationEntry` ne partagent jamais le même
   `label`.
7. **Parité d'affichage.** Le même catalogue alimente à la fois
   `OnboardingWizard` et `ProfileSection`, de sorte que le premier lancement et
   les modifications ultérieures proposent le même vocabulaire.

## Cas limites

- **L'utilisateur ignore les suggestions** et tape `tlon` (faute de frappe) :
  stocké tel quel, scoré comme aujourd'hui. La complétion est optionnelle ; nous
  ne faisons pas d'autocorrection.
- **L'utilisateur tape une banlieue absente du catalogue** (par ex. `Sceaux`) :
  stocké tel quel ; `location-matching.ts` le résout toujours s'il figure dans
  `METRO_AREAS`.
- **Intention multi-valeurs** (`Paris et Lyon`) : la saisie est une chaîne
  unique ; le datalist suggère un libellé à la fois. Le multi-localisation est
  hors périmètre (voir `onboarding-workmode-location.model.md`).
- **i18n / hors France** : le catalogue est centré sur la France, conformément
  au périmètre actuel du scorer. Ajouter d'autres pays constitue une extension de
  périmètre future, non un point bloquant.
- **Identifiants `<datalist>` dupliqués** lorsque les deux surfaces sont montées :
  chaque surface rend son propre `<datalist>` avec un identifiant stable et
  propre à la surface (`ob-location-catalog`, `profile-location-catalog`) pour
  éviter toute collision.
- **Accessibilité** : `<datalist>` est accessible par défaut ; les associations
  existantes `<label for="…">` sont préservées. Aucun nouvel attribut ARIA
  n'est nécessaire.

## Tests

- **Unitaires (sans mocks)** dans `tests/unit/locations/location-catalog.test.ts` :
  - chaque entrée a un `label` non vide et ≥1 alias ;
  - les libellés sont uniques ;
  - les alias sont normalisés (sans accents, minuscules) ;
  - couverture de la graine initiale : chaque clé de `REGION_SYNONYMS` et chaque
    ville de `METRO_AREAS` est représentée par au moins un alias d'entrée ;
  - la liste des capitales régionales (Rennes, Montpellier, …) est présente.
- **Régression** : `pnpm --filter @pulse/extension test:regression` doit rester
  vert (aucun changement de parser/scoring).
- **Manuels / E2E** : taper `par` lors de l'onboarding → les suggestions
  incluent `Paris` ; taper `aix` → `Aix-en-Provence` ; la sélection écrit le
  libellé canonique.

## Évolutions futures (explicitement hors périmètre ici)

- ~~Faire en sorte que `location-matching.ts` **dérive** `REGION_SYNONYMS` et
  `METRO_AREAS` depuis `LOCATION_CATALOG`, afin que le scorer et le module de
  complétion partagent une unique source de vérité.~~ **Livré** — voir
  `models/location-tables-derivation.model.md`.
  `core/locations/derive-location-tables.ts` exporte désormais les deux tables,
  dérivées de façon pure depuis le catalogue ; `location-matching.ts` les importe
  avec son algorithme inchangé.
- Bouton optionnel « Utiliser ma position » basé sur `navigator.geolocation` +
  un géocodeur inverse hors ligne, soumis à l'autorisation de l'utilisateur.
  Nécessite un modèle distinct en raison de la tension avec le principe
  local-first.
- Combobox sur mesure avec regroupement par aire métropolitaine si l'expérience
  utilisateur du datalist s'avère limitante.
