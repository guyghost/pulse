# Modèle de dérivation des tables de localisation (suivi)

Source de vérité pour faire de `core/locations/location-catalog.ts` l'**unique source de vérité** à partir de laquelle le scorer dérive ses tables de synonymes et d'aires métropolitaines. Implémente l'élément « Future » de `location-completion.model.md`. Il s'agit d'un **changement de données de scoring** (additif), il dispose donc de son propre modèle conformément à la règle Modèle → Revue → Implémentation → Vérification.

## Problème

Il existe aujourd'hui deux jeux de données parallèles, maintenus manuellement, décrivant les lieux français :

1. `core/scoring/location-matching.ts` → `REGION_SYNONYMS` (groupes d'équivalence : `paris ↔ 75 ↔ ile de france`) et `METRO_AREAS` (proximité : `nanterre → paris`).
2. `core/locations/location-catalog.ts` → `LOCATION_CATALOG` (entrées d'affichage + suggestion, chacune avec des `aliases` et un tag `metro` optionnel).

Le catalogue a été _dérivé des_ tables du scorer lors de sa création, de sorte que les deux encodent deux fois la même connaissance. Ajouter un lieu à la datalist ne le fait pas reconnaître par le scorer tant que quelqu'un ne modifie pas également les tables du scorer — un bogue classique de dérive qui ne demande qu'à se produire. La solution consiste à supprimer la duplication : le scorer doit **dériver** ses tables à partir du catalogue.

## Objectif

`core/scoring/location-matching.ts` conserve son **algorithme** (`matchLocation`, `normalizeLocation`, construction du cache, ordre d'appariement en 7 étapes) à l'octet près. Il supprime les constantes codées en dur `REGION_SYNONYMS` et `METRO_AREAS` et importe à la place des tables **dérivées** de `LOCATION_CATALOG` via un nouveau module pur `core/locations/derive-location-tables.ts`.

Après ce changement, il n'y a exactement qu'un seul endroit à modifier lorsqu'une ville française est ajoutée : le catalogue. La datalist et le scorer se mettent à jour ensemble.

## Hors périmètre (Non-goals)

- Aucune modification de l'algorithme `matchLocation`, de son ordonnancement d'étapes ou de son type de retour. La sémantique d'appariement est figée par le fichier de test existant de 428 lignes `tests/unit/scoring/location-matching.test.ts`.
- Aucun changement dans `relevance.ts` ou `DEFAULT_SCORING_WEIGHTS`.
- Aucun changement dans la forme, la persistance ou les messages de `UserProfile.location`.
- Pas de géolocalisation, pas de réseau, pas de nouvelles permissions (hérité du modèle de complétion).

## Flux de données (après)

```
LOCATION_CATALOG (core/locations/location-catalog.ts)   ← source unique
   │
   ▼  deriveRegionSynonyms() / deriveMetroAreas()   (pur, core/locations/)
REGION_SYNONYMS, METRO_AREAS  (dans core/locations/derive-location-tables.ts)
   │
   ▼  importé par
core/scoring/location-matching.ts
   │  construit SYNONYM_CACHE / METRO_AREA_CACHE / METRO_DEPARTMENT_CACHE (inchangé)
   ▼
matchLocation(mission.location, profile.location)        ← algorithme inchangé
```

Le sens respecte la règle de stratification : le scorer (core) importe les données (core). Pas de shell, pas d'UI, pas d'I/O.

## Règles de dérivation

### `deriveRegionSynonyms(catalog): Record<string, readonly string[]>`

**Un seul groupe par entrée _canonique_ uniquement.** Une entrée canonique est une entrée qui soit ne fait partie d'aucune métropole (`entry.metro` est indéfini — capitales régionales, Remote), **soit** est la ville canonique de sa métropole (`normalizeLocationAlias(entry.label) === entry.metro` — Paris, Lyon, …).

Les entrées de banlieue (`entry.metro` défini et label ≠ metro, ex. Nanterre, Villeurbanne) sont **exclues** des groupes de synonymes. Elles sont représentées uniquement dans `METRO_AREAS` (proximité). Ce n'est pas cosmétique : sans cela, les codes de département entrent en collision. `Villeurbanne` porte l'alias `'69'`, et si elle possédait un groupe de synonymes, la règle du dernier écrivain gagnant (last-write-wins) réassignerait `'69'` loin de `'lyon'`, cassant `areRegionalSynonyms('lyon', '69')` et le test _« matches Lyon with 69 » → 'synonym'_.

```
for each entry e in catalog:
  canonical = normalizeLocationAlias(e.label)
  if e.metro is undefined OR canonical === e.metro:
      REGION_SYNONYMS[canonical] = e.aliases
  // else: suburb — handled by METRO_AREAS only
```

Le cache de synonymes construit à partir de cela (`alias → canonical`) est un **sur-ensemble** de celui construit à partir de l'ancien `REGION_SYNONYMS`, sous réserve que le catalogue contienne chaque alias présent dans l'ancienne table (voir « Alias restaurés pour la parité » ci-dessous). Les clés secondaires redondantes de l'ancienne table (`'ile de france'`, `'rhone'`, `'bouche du rhone'`, …) ne sont **pas** nécessaires : elles n'existaient que pour amorcer le cache inverse, et le cache inverse est déjà entièrement amorcé par chaque alias apparaissant une fois dans la liste de son entrée canonique.

### `deriveMetroAreas(catalog): Record<string, MetroAreaData>`

Grouper les entrées par `entry.metro`. Pour chaque nom de métropole `M` :

```
cities       = [ normalizeLocationAlias(e.label) for e in catalog if e.metro === M ]
departments  = [ code for code in union(e.aliases) if /^\d{2,3}$/.test(code) ]
```

- `cities` **exclut** le nom canonique propre à la métropole (ex. `'paris'`). Cet auto-mappage est ajouté séparément par `buildMetroAreaCache` du scorer, qui définit toujours `metroName → metroName` indépendamment de `cities`. Conserver le canonique hors de `cities` évite une entrée redondante et respecte le contrat de dérivation : `cities` ne liste que les lieux _environnants_ qui renvoient vers la métropole.
- `departments` capture les codes de département de petite + grande couronne qui apparaissent en tant qu'alias des villes membres (ex. `92`, `93`, `94`, et désormais `78`, `91`, `77`, `95` pour Paris).

Les tables résultantes doivent être un **sur-ensemble** des anciennes (chaque ancienne ville et département étant toujours présent), afin qu'aucune localisation appariée auparavant ne puisse régresser.

## Changements de comportement (additifs, intentionnels)

Puisque le catalogue est un sur-ensemble des anciennes tables du scorer, la dérivation **ajoute** des lieux reconnus. Concrètement par rapport aux anciennes tables codées en dur :

1. **Plus de synonymes** : chaque capitale régionale du catalogue (Rennes, Montpellier, Grenoble, …) est désormais résolue en tant que groupe de synonymes canonique, de sorte que `matchLocation` peut retourner `'synonym'`/`'partial'` pour des entrées qui retournaient auparavant `'none'`. Strictement supérieur.
2. **Davantage de proximité (grande couronne parisienne)** : `METRO_AREAS.paris.departments` s'étend de `['92','93','94']` pour inclure `'78','91','77','95'` (et `'75'`). Une mission à Versailles (78) ou Marne-la-Vallée (77) obtient désormais un score `'nearby'` par rapport à un profil Paris au lieu de `'none'`. C'est géographiquement correct et constitue une amélioration explicite.
3. **Alias restaurés pour la parité** : le catalogue doit être enrichi des quelques alias que l'ancienne table possédait mais dont le catalogue est dépourvu — `Paris 75`, `Paris 1er` et `100% Remote` — afin que le cache de synonymes dérivé soit un sur-ensemble strict et qu'aucune correspondance de synonyme de cas limite ne soit perdue.

Le sens de chaque modification tend **vers un meilleur appariement** (none → partial → nearby → synonym → exact), jamais l'inverse. C'est la garantie d'additivité.

## Durcissement contre les collisions (suivi de revue)

La dérivation à partir d'un catalogue général a mis en évidence deux catégories de faux positifs au niveau des tokens que l'ancienne table ajustée à la main évitait par omission. Toutes deux sont corrigées :

1. **Alias de mots simples de région/département englobant plusieurs villes.** Un alias isolé dont le token apparaît également dans le nom d'un autre lieu conduit `hasSynonymTokenMatch` à un faux résultat `'synonym'`. Deux de ces alias ont été **nouvellement introduits** par la dérivation (aucun ne figurait dans l'ancienne table) et sont par conséquent retirés du catalogue pour restaurer le comportement antérieur :
   - `'Loire'` sur **Saint-Étienne** — le token `loire` apparaît également dans `Pays de la Loire` (région de Nantes) et `Loire-Atlantique`, ainsi `matchLocation('Nantes, Pays de la Loire', 'Saint-Étienne')` renvoyait faussement `'synonym'`. Saint-Étienne conserve `'42'`.
   - `'Bretagne'` sur **Rennes** — la Bretagne est la région contenant à la fois Rennes et Brest (toutes deux dans le catalogue), de sorte que `matchLocation('Brest, Bretagne', 'Rennes')` renverrait faussement `'synonym'`. Rennes conserve `'35'` et `'Ille-et-Vilaine'`.
     `'Rhône'` sur **Lyon** est délibérément conservé : il était présent dans l'ancienne table (`lyon ↔ 69 ↔ rhone`), est couvert par un test de contrat, et le risque de collision est faible car les missions dans les villes paires nomment la ville et non le mot `Rhône`.

2. **Codes départementaux numériques vs numéros d'arrondissement.** Les codes départementaux (`'17'` = Charente-Maritime/La Rochelle, `'13'` = Bouches-du-Rhône, …) entrent en collision avec les numéros d'arrondissement de Paris/Marseille, ainsi `matchLocation('Paris 17', 'La Rochelle')` renvoyait faussement `'synonym'`. `hasSynonymTokenMatch` **ignore désormais les tokens uniques purement numériques** dans sa boucle de tokens individuels. C'est sans risque car l'appariement numérique sur la chaîne entière (`'75'` ↔ `'Paris'`) est toujours résolu plus tôt par la vérification sur chaîne complète `areRegionalSynonyms`, et les codes numériques à l'intérieur de phrases de plusieurs mots ne sont pas affectés (les phrases sont n>=2). Les tokens uniques canoniques non numériques (`'paris'`, `'lyon'`, …) ne sont pas affectés.

## Alignement du normaliseur (suivi de revue)

`normalizeLocationAlias` (catalogue) reflète désormais **exactement** le `normalizeLight` du scorer : minuscules → suppression des accents → fusion de `œ`/`æ` → tirets en espaces → réduction des espaces blancs. Les deux laissent les autres ponctuations (apostrophes, points) intactes, de sorte que les clés de cache d'alias s'alignent octet par octet avec les chaînes normalisées légèrement (light-normalized) auxquelles le scorer les compare. Cela corrige `Côte-d'Or` (Dijon), `Villenave-d'Ornon` et `L'Union`, dont les alias comportant des apostrophes se normalisaient auparavant sous une forme que le scorer ne produit jamais. La concordance sur l'ensemble du corpus du catalogue est affirmée dans `location-catalog.test.ts`.

## Garanties de non-régression (la checklist de Revue)

1. **Aucun appariement ne peut empirer.** Tables dérivées ⊇ anciennes tables ⇒ pour toute paire d'entrées, le nouveau résultat de `matchLocation` est ≥ à l'ancien résultat selon l'ordre de qualité `none < partial < nearby < synonym < exact`.
2. **Pas de collision de synonymes sur les codes de département.** Un code de département (ex. `'69'`, `'59'`) appartient à **exactement un seul** groupe de synonymes — la capitale régionale ou le canonique de métropole qui le possède. Deux cas sont interdits :
   - **Banlieue de métropole** (Villeurbanne a `metro: 'lyon'`) : `isSynonymCanonical` renvoie false, elle ne crée donc aucun groupe et ne réassigne jamais `'69'`.
   - **Ville autonome secondaire dans le même département** (ex. Dunkerque, Nord = 59) : elle ne DOIT PAS déclarer `'59'`/`'nord'` comme alias, sinon le cache last-write-wins du scorer réassigne `'59'` loin de `'lille'` et `areRegionalSynonyms('lille', '59')` bascule silencieusement à `false`. Les villes secondaires restent suggérables par leur nom uniquement.
     Application : `derive-location-tables.test.ts` affirme que chaque alias de 2 à 3 chiffres dans `REGION_SYNONYMS` est détenu par exactement un canonique.
3. **Les tests existants restent au vert.** Les cas « ne correspond PAS » entre métropoles disjointes (Nanterre↔Lyon, Villeurbanne↔Paris, Mérignac↔Toulouse, Blagnac↔Bordeaux) reposent sur des appartenances métropolitaines disjointes, que la dérivation préserve (le tag `metro` d'une ville est inchangé).
4. **Saint-Quentin (sans "-en-Yvelines") toujours → none vs Paris.** La chaîne `"saint quentin"` n'est ni une ville membre (`'saint quentin en yvelines'`) ni un code de département, elle ne peut donc pas se résoudre vers la métropole parisienne.
5. **Caches de forme identique.** `SYNONYM_CACHE`, `METRO_AREA_CACHE` et `METRO_DEPARTMENT_CACHE` sont construits par les mêmes fonctions qu'auparavant ; seule la constante source change.

## Invariants

1. **Source unique de vérité.** Après ce changement, `core/scoring/` ne contient aucune donnée codée en dur sur les lieux français. Tout réside dans `LOCATION_CATALOG`.
2. **Dérivation pure.** `derive-location-tables.ts` est pur : pas d'I/O, pas d'async, pas de `Date`/`Math.random`. Couvert par la barrière de couverture sans mocks `src/lib/core/**`.
3. **Stabilité de l'algorithme.** La cascade de `matchLocation` est inchangée à l'exception d'un durcissement ciblé dans `hasSynonymTokenMatch` (ignorer les tokens uniques purement numériques — voir _Durcissement contre les collisions_). L'appariement numérique sur chaîne entière et tous les appariements de tokens non numériques se comportent exactement comme avant. Le fichier de test constitue le contrat de régression.
4. **Sur-ensemble uniquement (alias non numériques).** Les tables dérivées sont un sur-ensemble des tables antérieures au changement pour chaque alias que l'ancienne table portait. Les deux alias isolés supprimés (`Loire`, `Bretagne`) ne figuraient **pas** dans l'ancienne table — ils avaient été nouvellement introduits par la dérivation et causaient des faux positifs entre villes, leur suppression restaure donc les résultats d'appariement d'avant le changement.
5. **Aucun changement de schéma/poids.** `UserProfile.location`, `relevance.ts` et `DEFAULT_SCORING_WEIGHTS` restent inchangés.

## Tests

- **Nouveau** `tests/unit/locations/derive-location-tables.test.ts` (sans mocks) :
  - chaque valeur dans `REGION_SYNONYMS` est non vide et normalisée ;
  - les contrats de synonymes porteurs sont préservés (`paris ↔ 75 ↔ ile de france`, `lyon ↔ 69 ↔ rhone`, `marseille ↔ 13 ↔ bouches du rhone`, `remote ↔ teletravail`, standalone `nantes ↔ 44 ↔ loire atlantique`) ;
  - **anti-collision** : chaque code de département (`/^\d{2,3}$/`) est détenu par exactement un groupe de synonymes canonique ;
  - les banlieues (Villeurbanne, Nanterre, Aix-en-Provence, Mérignac, Blagnac) ne créent aucun groupe de synonymes ;
  - `METRO_AREAS` contient les métropoles attendues ; les villes de Paris incluent Nanterre ; les départements de Paris incluent la petite couronne (`75`,`92`,`93`,`94`) **et** la grande couronne (`78`,`91`,`77`,`95`) ; Lyon possède `69` + la ville `villeurbanne` ;
  - les lieux autonomes et variantes distantes ne sont pas des aires métropolitaines ;
  - les codes de département dérivés correspondent à `/^\d{2,3}$/`.
- **Existant** `tests/unit/scoring/location-matching.test.ts` doit passer à l'exception des assertions contredites par les règles de _Durcissement contre les collisions_ (collisions numériques d'arrondissements, faux positifs des mots simples `Loire`/`Bretagne`) ; celles-ci sont mises à jour parallèlement au changement matcher/catalogue.
- **Régression** : `pnpm --filter @pulse/extension test:regression` reste au vert.
- **Suite complète** : `pnpm --filter @pulse/extension typecheck && lint && test`.

## Migration

Aucune. Les tables sont reconstruites au chargement du module à partir du catalogue statique ; aucune donnée persistée ne les référence. Les chaînes `UserProfile.location` déjà stockées et les enregistrements de missions sont évalués avec le même algorithme et un vocabulaire étendu (sur-ensemble) — les scores ne peuvent qu'augmenter ou rester égaux, jamais baisser, pour une entrée donnée.

## Perspectives (Future)

- Une fois la dérivation stabilisée, l'ancien type en ligne `MetroAreaData` et les helpers `buildSynonymCache`/`buildMetroAreaCache` pourront également être dédupliqués dans `core/locations/`. Hors périmètre ici pour maintenir le diff facile à relire.
- Une politique d'enrichissement régulée de `LOCATION_CATALOG` (qui ajoute des entrées, barrière de revue) — préoccupation de processus, non modélisée ici.
