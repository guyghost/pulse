# Spec : Interaction du feed MVP

## Objectif

Formaliser les cinq interactions cœur du feed — voir, favori, filtrer, trier et rechercher —
avec des critères d'acceptance testables ancrés dans l'implémentation réelle.

Le feed est l'écran où les utilisateurs passent la majorité de leur temps. Cette spec sert de
référence canonique pour ces interactions, garantissant que les changements futurs ne cassent
pas silencieusement le comportement attendu et fournissant aux nouveaux contributeurs une
source de vérité unique.

## Périmètre

| #    | Interaction                           | Module d'état principal                                         |
| ---- | ------------------------------------- | --------------------------------------------------------------- |
| US-1 | Marquer les missions comme vues       | `feed-page.svelte.ts` → `seen-missions.ts`                      |
| US-2 | Favori / masquer les missions         | `feed-page.svelte.ts` → `favorites.ts`                          |
| US-3 | Filtrer les missions (multi-critères) | `feed-page.svelte.ts`                                           |
| US-4 | Trier les missions                    | `feed-page.svelte.ts` → `sort-missions.ts` / `rank-missions.ts` |
| US-5 | Rechercher les missions               | `feed.svelte.ts`                                                |

**Hors périmètre :** panneau de détail mission, comparaison, raccourcis clavier, vues
sauvegardées, déclenchement du scan, onboarding. Ces sujets sont documentés ailleurs ou
sont secondaires par rapport à la boucle cœur du feed.

## Contexte architecture

- **État :** runes Svelte 5 (`$state`, `$derived`) dans `src/lib/state/`.
- **Persistance :** `chrome.storage.local` pour les IDs vus, favoris, masqués et la
  préférence de tri. IndexedDB pour les missions (chargées via `getMissions()`).
- **Séparation Core/Shell :** toute la logique de filtrage et de scoring vit dans des
  fonctions Core pures (`filterFavoritesOnly`, `filterHidden`, `sortMissions`,
  `rankMissions`, `recomputeFilteredMissions`). Les modules d'état orchestrent l'I/O et
  délèguent les calculs au Core.
- **Pas d'accès storage direct depuis l'UI :** le side panel lit/écrit la persistance via
  des fonctions facade, sans jamais toucher `chrome.*` ni IndexedDB directement.

---

## US-1 : Marquer les missions comme vues

**En tant que** consultant
**Je veux** que les missions déjà consultées soient visuellement distinguées des nouvelles
**Afin de** ne pas relire les mêmes opportunités.

### Critères d'acceptance

1. **AC-1.1 — Marquage à la vue :** quand une carte mission entre dans le viewport (ou est
   cliquée), `handleMissionSeen(missionId)` la met en file pour marquage.

2. **AC-1.2 — Persistance debouncée :** les IDs vus sont poussés vers le storage par lots
   avec un debounce de 120 ms (`SEEN_FLUSH_MS`). Un scroll rapide ne produit pas une
   écriture par carte.

3. **AC-1.3 — Persiste entre les sessions :** les IDs vus sont stockés dans
   `chrome.storage.local` sous la clé `seenMissionIds` et rechargés au montage du panel
   via `getSeenIds()`.

4. **AC-1.4 — Idempotent :** re-marquer une mission déjà vue est un no-op
   (`pendingSeenIds` déduplique).

5. **AC-1.5 — Flush au démontage :** `dispose()` pousse les IDs vus en attente avant le
   démontage du composant, évitant toute perte de données.

6. **AC-1.6 — Comptage « nouvelles » exact :** `dashboardSummary.newCount` reflète les
   missions absentes de `seenSet`, restreint à l'ensemble visible/filtré.

### Références d'implémentation

| Composant           | Emplacement                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| Handler d'événement | `feed-page.svelte.ts` → `handleMissionSeen`, `scheduleSeenFlush`, `flushSeenIds` |
| Calcul pur          | `core/seen/mark-seen.ts` → `markAsSeen(seenIds, newIds)`                         |
| Persistance         | `shell/storage/seen-missions.ts` → `getSeenIds`, `saveSeenIds`                   |

### Cas limites

- **Storage indisponible :** les échecs de `saveSeenIds` sont avalés (non critique).
  L'état en mémoire `seenIds` reste mis à jour pour la session courante.
- **Flush vide :** `flushSeenIds` retourne tôt si `pendingSeenIds` est vide.

---

## US-2 : Favoris et missions masquées

**En tant que** consultant
**Je veux** mettre de côté les missions prometteuses et masquer les hors-sujet
**Afin de** construire une shortlist et réduire le bruit.

### Critères d'acceptance

1. **AC-2.1 — Toggle favori :** `handleToggleFavorite(id)` ajoute/retire la mission de la
   map des favoris avec un timestamp ISO.

2. **AC-2.2 — Toggle masqué :** `handleHide(id)` ajoute/retire la mission de la map des
   masquées avec un timestamp.

3. **AC-2.3 — Persiste entre les sessions :** favoris stockés sous la clé `favorites`,
   masqués sous la clé `hidden` dans `chrome.storage.local`. Les deux sont rechargés au
   montage.

4. **AC-2.4 — Toast d'annulation :** les deux actions affichent un toast avec un bouton
   « Annuler » qui rétablit l'état et re-persiste la valeur précédente.

5. **AC-2.5 — Filtre favoris :** activer `showFavoritesOnly` filtre le feed sur les
   missions favorites uniquement via `filterFavoritesOnly(result, favorites)`.

6. **AC-2.6 — Filtre masqués :** par défaut, les missions masquées sont exclues via
   `filterHidden(result, hidden)`. Activer `showHidden` les révèle.

7. **AC-2.7 — Compteurs :** `favoriteCount` et `hiddenCount` sont dérivés des maps et
   réactifs.

### Références d'implémentation

| Composant             | Emplacement                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Handlers d'événements | `feed-page.svelte.ts` → `handleToggleFavorite`, `handleHide`                                            |
| Calcul pur            | `core/favorites/favorites.ts` → `toggleFavorite`, `toggleHidden`, `filterFavoritesOnly`, `filterHidden` |
| Persistance           | `shell/storage/favorites.ts` → `getFavorites`, `saveFavorites`, `getHidden`, `saveHidden`               |
| Toast                 | `shell/notifications/toast-service.ts` → `showToastAction`                                              |

### Cas limites

- **Annulation après échec storage :** le handler d'annulation re-persiste l'état
  précédent en best-effort ; si le storage est indisponible, l'état en mémoire est quand
  même rétabli pour la session courante.

---

## US-3 : Filtrer les missions (multi-critères)

**En tant que** consultant
**Je veux** restreindre le feed par source, mode remote, séniorité, stack technique et score
**Afin de** me concentrer sur les missions correspondant à mes critères.

### Critères d'acceptance

1. **AC-3.1 — Filtre source :** `setSelectedSource(source)` filtre sur une source de
   connecteur unique (`free-work`, `lehibou`, `hiway`, `collective`, `cherry-pick`,
   `malt`). `null` le réinitialise.

2. **AC-3.2 — Filtre remote :** `setSelectedRemote(remote)` filtre par mode de travail
   (`full`, `hybrid`, `onsite`). `null` le réinitialise.

3. **AC-3.3 — Filtre séniorité :** `setSelectedSeniority(level)` filtre par
   `junior`, `confirmed` ou `senior`. `null` le réinitialise.

4. **AC-3.4 — Filtre stack (multi-sélection) :** `toggleStack(stack)` bascule chaque
   stack. Une mission passe si elle contient **au moins une** des stacks sélectionnées.
   Sélection vide = pas de filtrage par stack.

5. **AC-3.5 — Filtre par tranche de score :** `setSelectedScoreBucket(bucket)` filtre par
   bande de score :
   - `strong` : score ≥ 80
   - `good` : 60 ≤ score < 80
   - `weak` : score < 60

6. **AC-3.6 — Presets de décision :** `applyDecisionPreset(preset)` applique un
   quick-filtre :
   - `priority` : score ≥ 80
   - `remote-compatible` : `remote === 'full' \|\| 'hybrid'`
   - `tjm-negotiation` : TJM sous le minimum du profil
   - `new` : absente du set des vues
     Rebaser le preset actif le réinitialise.

7. **AC-3.7 — Toggle nouvelles uniquement :** `toggleNewOnly()` filtre sur les missions
   non vues.

8. **AC-3.8 — Composable :** tous les filtres se combinent en logique ET. Une mission doit
   passer chaque filtre actif pour apparaître.

9. **AC-3.9 — Tout effacer :** `clearAllFilters()` réinitialise chaque filtre à son état
   par défaut (null/vide).

10. **AC-3.10 — Indicateur de filtre :** `filterActive` vaut `true` dès qu'un filtre est
    engagé, activant une affordance « effacer » dans l'UI.

11. **AC-3.11 — Performance :** le filtrage combiné de ≤ 500 missions s'exécute en
    < 100 ms (recalcul `$derived` en mémoire, pas d'I/O dans le chemin chaud).

### Références d'implémentation

| Composant                  | Emplacement                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| État de filtres + handlers | `feed-page.svelte.ts` → `sourceCountBaseMissions` dérivé, `setSelected*`, `toggleStack`, `applyDecisionPreset`, `clearAllFilters` |
| Helper de tranche de score | `feed-page.svelte.ts` → `getScoreBucket(score)`                                                                                   |
| Comptages de facettes      | `feed-page.svelte.ts` → `feedAggregates` dérivé (distribution des scores, comptages de presets)                                   |

### Cas limites

- **Champs mission null :** les missions avec `remote === null` ou `seniority === null`
  sont exclues quand le filtre correspondant est actif (elles ne correspondent à aucune
  valeur spécifique).
- **Preset vs filtre explicite :** appliquer le preset `priority` efface un
  `selectedScoreBucket` actif, et réciproquement, pour éviter les états conflictuels.

---

## US-4 : Trier les missions

**En tant que** consultant
**Je veux** ordonner le feed par pertinence, fraîcheur ou taux journalier
**Afin de** retrouver les missions les plus actionnables en tête.

### Critères d'acceptance

1. **AC-4.1 — Modes de tri :** `sortBy` accepte trois valeurs : `score` (défaut), `date`,
   `tjm`.

2. **AC-4.2 — Score (ranking composite) :** quand `sortBy === 'score'`, les missions sont
   ordonnées par `rankMissions()` — un composite de pertinence (score existant) et de
   fraîcheur (récence de publication), avec entrelacement de diversité des sources. Voir
   `rank-missions.ts`.

3. **AC-4.3 — Date :** quand `sortBy === 'date'`, les missions sont triées de la plus
   récente à la plus ancienne par timestamp `scrapedAt` via `sortMissions(missions, 'date')`.

4. **AC-4.4 — TJM :** quand `sortBy === 'tjm'`, les missions sont triées du TJM le plus
   haut au plus bas. Un TJM null est traité comme 0.

5. **AC-4.5 — Persiste entre les sessions :** le mode de tri sélectionné est stocké dans
   `chrome.storage.local` via `setFeedSortBy()` et restauré au montage via `getFeedSortBy()`.

6. **AC-4.6 — Pas de mutation :** le tri retourne un nouveau tableau ; l'entrée n'est pas
   mutée.

7. **AC-4.7 — Tri appliqué post-filtre :** le tri s'applique à l'ensemble filtré
   (`displayMissions`), pas à la liste brute des missions.

### Références d'implémentation

| Composant         | Emplacement                                                          |
| ----------------- | -------------------------------------------------------------------- |
| Dispatch du tri   | `feed-page.svelte.ts` → `displayMissions` dérivé                     |
| Ranking composite | `core/scoring/rank-missions.ts` → `rankMissions`                     |
| Tri à clé unique  | `core/scoring/sort-missions.ts` → `sortMissions`                     |
| Persistance       | `shell/storage/chrome-storage.ts` → `getFeedSortBy`, `setFeedSortBy` |

### Cas limites

- **Scores null :** traités comme 0 pour le ranking.
- **Scores égaux :** stable au sein du groupe de source (le round-robin préserve l'ordre
  des buckets).
- **Missions datées du futur :** le score de fraîcheur est plafonné à 100.

---

## US-5 : Rechercher les missions

**En tant que** consultant
**Je veux** effectuer une recherche plein texte dans les détails des missions
**Afin de** trouver rapidement les missions mentionnant une technologie ou un client précis.

### Critères d'acceptance

1. **AC-5.1 — Champs recherchables :** la requête porte sur une chaîne concaténée de :
   `title`, `client`, `description`, `location`, `source` et toutes les entrées `stack`.

2. **AC-5.2 — Insensible à la casse :** la requête et le texte recherchable sont mis en
   minuscules avant le matching.

3. **AC-5.3 — Match par sous-chaîne :** une mission correspond si la requête en
   minuscules apparaît comme sous-chaîne n'importe où dans le texte recherchable.

4. **AC-5.4 — Debounce :** les requêtes non vides sont debouncées avec un délai de 300 ms
   (`SEARCH_DEBOUNCE_MS`) pour éviter de recalculer à chaque frappe.

5. **AC-5.5 — Effacement instantané :** une requête vide efface la recherche immédiatement
   (sans attendre le debounce).

6. **AC-5.6 — Composable avec les filtres :** la recherche s'applique d'abord (dans le
   store du feed), puis les filtres et le tri s'appliquent à l'ensemble filtré par
   recherche.

7. **AC-5.7 — Aucun match :** si aucune mission ne correspond, le feed affiche un état
   vide (pas une erreur).

8. **AC-5.8 — Performance :** la recherche sur ≤ 500 missions s'exécute en < 100 ms
   (filtre en une passe, pas d'I/O).

### Références d'implémentation

| Composant                  | Emplacement                                                 |
| -------------------------- | ----------------------------------------------------------- |
| Handler de champ recherche | `feed-page.svelte.ts` → `handleSearch` (debounce)           |
| Filtre de recherche (pur)  | `feed.svelte.ts` → `recomputeFilteredMissions`              |
| État du store du feed      | `feed.svelte.ts` → `searchQuery`, `filteredMissions` dérivé |

### Cas limites

- **Requête uniquement composée d'espaces :** traitée comme vide (garde `.trim()`) →
  efface la recherche.
- **Caractères spéciaux :** pas de support regex ni wildcard ; match par sous-chaîne simple.

---

## Exigences non fonctionnelles

| Exigence                              | Cible                                                     | Justification                                                               |
| ------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Latence filtre + tri (≤ 500 missions) | < 100 ms                                                  | Le feed doit paraître instantané ; tout le calcul est `$derived` en mémoire |
| Debounce de recherche                 | 300 ms                                                    | Équilibre entre réactivité et coût de recalcul                              |
| Debounce de marquage vu               | 120 ms                                                    | Loter les écritures sans lag visible                                        |
| Persistance                           | `chrome.storage.local`                                    | Survit aux redémarrages du navigateur ; isolé par extension                 |
| Immutabilité                          | Toutes les fonctions Core retournent de nouveaux tableaux | Aucune mutation de l'état d'entrée                                          |

## Références de tests

| Interaction                  | Fichier de test                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Tri (clé unique)             | `tests/unit/scoring/sort-missions.test.ts`                                                         |
| Ranking (composite)          | `tests/unit/scoring/rank-missions.test.ts`                                                         |
| Marquer comme vu             | `tests/unit/scoring/dedup.test.ts` (pattern mark-seen), `tests/unit/storage/seen-missions.test.ts` |
| Favoris                      | `tests/unit/storage/favorites.test.ts`                                                             |
| Filtre de notification smart | `tests/unit/scoring/smart-notification.test.ts`                                                    |

## Journal des changements

| Date       | Changement                                                                           |
| ---------- | ------------------------------------------------------------------------------------ |
| 2026-07-02 | Spec initiale (#59). Documente l'implémentation existante comme référence canonique. |
