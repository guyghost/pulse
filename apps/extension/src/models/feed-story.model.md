# Feed Story Model — Operational hero card presentation

> Modèle de présentation pour la **story card opérationnelle** en haut du feed.
> Pure projection — introduit aucune transition produit. Source de vérité pour
> l'état visuel du hero.

## Statut

Ce modèle est **une projection de présentation pure**. Il ne définit **aucune
nouvelle transition produit**. L'état canonique des missions et du scan reste
dans `scan-lifecycle.model.md` et `feed-page.svelte.ts`. `buildFeedStory()` ne
fait que projeter les faits du contrôleur/page en copy/sévérité/action.

**Le modèle décide ; la présentation reflète.**

## Périmètre

Card opérationnelle affichée en haut du feed (slot hero). Réagit aux états du
feed : erreurs, offline, sources cassées, nouvelles missions, prioritaires,
empty states. **Jamais** un widget permanent — c'est un call-to-action contextuel.

### Projection visuelle — gating par sévérité (2026 restructuration content-first)

La story card ne s'affiche **que si la sévérité projetée nécessite une action** :

| Sévérités projetées                            | Strip rendu ? | Justification                                                      |
| ---------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| `critical`, `incident`, `attention`            | **Oui**       | Une action est requise : la story a sa place en tête du feed       |
| `success`, `neutral` (états calmes, feed prêt) | **Non**       | Le contenu (missions) parle ; le compte vit dans l'en-tête compact |

Le gating vit dans `FeedPage.svelte` (`feedStoryNeedsAttention`, dérivé pur de
`feedStory.severity`). `buildFeedStory()` continue de projeter **tous** les
états — c'est la couche présentation qui filtre les états calmes. Le hero
compact porte le compte de missions (`visibleCount`) inline : pas de strip
redondant pour dire « tout va bien ».

### Une seule surface d'attention connecteurs

Quand `broken-sources` est le **signal de sévérité le plus élevé** (pas
d'erreur produit, pas de mode hors ligne), la story inline est la surface
canonique : le panneau détaillé `ConnectorAlertBar` ne rend **pas** en dessous
(`storyCoversConnectors` dans `FeedPage.svelte`). L'action primaire de la story
re-checke **tous** les connecteurs cassés. Ré-activer un connecteur désactivé
reste une transition délibérée (panneau de santé / réglages) — jamais implicite
depuis la story. Le `ConnectorAlertBar` ne rend que lorsqu'un signal de
précédence supérieure (erreur, offline) masque le signal connecteur : il porte
alors une information distincte, pas une duplication.

Invariant de couplage rendu : `storyCoversConnectors` n'est vrai **que si la
story inline est effectivement rendue**, c'est-à-dire quand le bloc hero-content
est actif (`heroCompact` OU contrôles avancés OU chrome busy OU résumé de scan).
La story inline ne vit que dans ce bloc ; avec **0 mission et un feed inactif**
(aucune des quatre conditions), elle n'apparaît pas et le `ConnectorAlertBar`
redevient la surface canonique — une source cassée ne doit **jamais** produire
zéro avertissement visible.

### Rendu inline — ligne calme (2026, inspiration Notion iOS)

La variante `inline` (hero compact du feed) est une **ligne unique discrète**,
pas une carte :

- pas de boîte teintée, pas de bordure, pas de badge chip ;
- la sévérité est portée par l'icône de tête (forme + teinte, contraste
  graphique ≥3:1 sur la surface blanche du hero) ;
- le titre tient sur une ligne (`truncate`) ; le `statusLabel` n'est pas
  affiché — il reste annoncé au lecteur d'écran via l'`aria-label` ;
- l'action primaire est un bouton texte discret (bleu blueprint, cible
  tactile ≥28px).

Invariant : hauteur de la ligne ≤ ~32px en état replié ; les états calmes ne
rendent aucune ligne (gating par sévérité, ci-dessus).

## États de présentation

Six états distincts, avec **précédence stricte** (de haut en bas) :

| État                  | Sévérité    | Condition                                                                            | Intention                                                      |
| --------------------- | ----------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `error-cached`        | `incident`  | `error != null && visibleCount > 0`                                                  | Données en cache disponibles, scan interrompu                  |
| `error-critical`      | `critical`  | `error != null && visibleCount === 0`                                                | Aucune donnée disponible, scan impossible                      |
| `offline`             | `incident`  | `isOffline`                                                                          | Hors ligne, données en cache disponibles                       |
| `broken-sources`      | `critical`  | `brokenConnectorCount > 0`                                                           | Sources cassées, feed incomplet                                |
| `new-missions`        | `attention` | `newCount > 0`                                                                       | Nouvelles missions à traiter, prioritaires ou non              |
| `priority-ready`      | `success`   | `alertEnabled && highScoreCount > 0 && newCount === 0`                               | Missions prioritaires disponibles (seuil dépassé)              |
| `filtered-empty`      | `attention` | `visibleCount === 0 && filterActive && totalMissionCount > 0`                        | **Des missions existent mais les filtres les masquent toutes** |
| `scanned-empty`       | `attention` | `visibleCount === 0 && hasCompletedScan && !(filterActive && totalMissionCount > 0)` | **Scan terminé, 0 résultat — ajuster le profil**               |
| `never-scanned-empty` | `neutral`   | `visibleCount === 0 && !hasCompletedScan`                                            | Premier lancement, inviter au scan                             |
| `feed-ready`          | `success`   | _défaut final_                                                                       | Feed prêt, aucune action requise                               |

**Précédence** : erreur > offline > sources cassées > nouvelles > prioritaires >
filtered-empty > scanned-empty > never-scanned > feed-ready.

### Distinction des empty states

Avant ce modèle, `visibleCount === 0` affichait toujours un neutral CTA "Lancez
un premier scan" — ambiguïté P0 quand un scan a **déjà terminé** et légitimement
trouvé zéro match, ou quand des **filtres actifs** masquent toutes les missions
en cache.

Trois signaux discriminants ordonnés (le premier qui matche gagne, dans le
bucket `visibleCount === 0`) :

1. **`filterActive && totalMissionCount > 0`** → `filtered-empty` (attention,
   CTA « Effacer les filtres »). Des missions existent en cache mais les filtres
   les masquent toutes. L'utilisateur doit ajuster/effacer ses filtres, **pas**
   modifier son profil ni relancer un scan.
2. **`hasCompletedScan`** (dérivé de `controller.lastScanAt != null`) →
   `scanned-empty` (attention, CTA profil). Un scan a terminé et légitimement
   trouvé zéro match.
3. sinon → `never-scanned-empty` (neutral, CTA scan). Premier lancement.

Invariant : `lastScanAt` est monotone (uniquement mis à jour sur succès scan),
donc `hasCompletedScan` est un edge-detector fiable. Cf. `scan-lifecycle.model.md`
et `scan-completion-delight.model.md` pour le contrat de `lastScanAt`.

**Note** : `totalMissionCount` est le count **non filtré**
(`allMissions.length`), distinct de `visibleCount` (post-recherche et
post-filtres). `filterActive` reflète la présence d'une recherche non vide ou
d'au moins un filtre source/remote/stack/seniority/score/preset/nouveau
sélectionné.

Quand `searchQuery.trim() !== ''`, la copy de `filtered-empty` devient :

- **title** : `Aucune mission pour « <requête> »`
- **description** :
  `Des missions sont disponibles, mais aucune ne correspond à cette recherche.`
- **primaryActionLabel** : `Effacer la recherche`

La requête est une entrée de projection, jamais interprétée comme une transition.

## Entrées (pures)

```ts
interface FeedStoryInput {
  error: string | null;
  isOffline: boolean;
  brokenConnectorCount: number;
  firstBrokenConnectorName: string | null;
  newCount: number;
  highScoreCount: number;
  visibleCount: number;
  alertEnabled: boolean;
  alertScoreThreshold: number;
  hasCompletedScan: boolean; // ← discriminant scanned-empty vs never-scanned
  filterActive: boolean; // ← au moins un filtre sélectionné
  totalMissionCount: number; // ← count non filtré (allMissions.length)
  searchQuery: string; // ← texte de recherche normalisé par la projection
}
```

## Sorties

```ts
interface FeedStory {
  severity: 'critical' | 'incident' | 'attention' | 'success' | 'neutral';
  statusLabel: string;
  title: string;
  description: string;
  evidence: OperationalEvidence[];
  primaryActionLabel: string;
  primaryActionIcon: IconName;
}
```

## Matrice de copie (FR)

### `filtered-empty` (attention) — NOUVEAU

- **statusLabel** : `Filtres sans résultat`
- **title** : `Aucune mission ne correspond à vos filtres actifs`
- **description** : `Des missions sont disponibles mais vos filtres les masquent toutes. Ajustez ou effacez les filtres pour les réafficher.`
- **primaryActionLabel** : `Effacer les filtres`
- **primaryActionIcon** : `filter-x`
- **evidence** : inchangée

### `scanned-empty` (attention) — NOUVEAU

- **statusLabel** : `Aucune correspondance`
- **title** : `Aucune mission ne correspond à votre profil actuel`
- **description** : `Ajustez vos critères de recherche, compétences ou localisation dans votre profil pour élargir les résultats.`
- **primaryActionLabel** : `Ajuster le profil`
- **primaryActionIcon** : `user`
- **evidence** : inchangée (Nouvelles=0, Prioritaires=0, Sources=0)

### `never-scanned-empty` (neutral) — existant, conservé

- **statusLabel** : `Aucune donnée`
- **title** : `Lancez un premier scan pour voir vos missions`
- **description** : `Connectez ou vérifiez les sources, puis lancez un scan pour obtenir les premières recommandations.`
- **primaryActionLabel** : `Lancer le scan`
- **primaryActionIcon** : `play`
- **evidence** : inchangée

## Actions primaires

| État                  | Action primaire           | Handler                                 |
| --------------------- | ------------------------- | --------------------------------------- |
| `error-*`             | `Réessayer le scan`       | `handleMissionFeedScanAction()`         |
| `offline`             | `Voir les N en cache`     | `scrollToMissionFeed()`                 |
| `broken-sources`      | `Relancer le diagnostic`  | `controller.recheckConnector(id)`       |
| `new-missions`        | `Voir les N nouvelles`    | `toggleNewOnly() + scroll`              |
| `priority-ready`      | `Voir les N prioritaires` | `showAlertOnly = true + scroll`         |
| **`filtered-empty`**  | **`Effacer les filtres`** | **`handleClearMissionFilters()`**       |
| **`scanned-empty`**   | **`Ajuster le profil`**   | **`appNavigation.navigate('profile')`** |
| `never-scanned-empty` | `Lancer le scan`          | `handleMissionFeedScanAction()`         |
| `feed-ready`          | `Voir le feed`            | `scrollToMissionFeed()`                 |

**Nouveauté** : `filtered-empty` efface les filtres (les missions existent en
cache) ; `scanned-empty` route vers la page **Profile** pour ajuster les
critères — ni l'un ni l'autre ne lance un scan intempestif.

## Implémentation — résolveur pur

`buildFeedStory(input: FeedStoryInput): FeedStory` est une **fonction pure**
dans le Core (`src/lib/core/feed/build-feed-story.ts` si extraite, ou inline
dans `FeedPage.svelte` module script). Zéro I/O, zéro async, zéro chrome.\*.

**Injection** : `hasCompletedScan` est passé depuis le shell via le `$derived`
de FeedPage :

```ts
const feedStory = $derived(
  buildFeedStory({
    // ...inputs existants
    hasCompletedScan: controller.lastScanAt != null,
  })
);
```

## Invariants

1. La story **ne bloque jamais** le feed — elle est un guide contextuel.
2. Aucune transition produit n'est créée ici — pure projection.
3. `buildFeedStory` est **testable sans mocks** (fonction pure).
4. `scanned-empty`, `filtered-empty` et `never-scanned-empty` sont **mutuellement
   exclusifs** : la précédence ordonne `filtered-empty` > `scanned-empty` >
   `never-scanned` dans le bucket `visibleCount === 0`.
5. Le handler `scanned-empty` **ne lance jamais de scan** — il route vers Profile.
   Le handler `filtered-empty` **ne lance jamais de scan ni ne route vers Profile**
   — il efface les filtres.
6. `hasCompletedScan` est monotone (une fois `true`, reste `true` sauf reset app).
7. `filtered-empty` ne peut se produire que si `totalMissionCount > 0` (des
   missions en cache) ET `filterActive` (filtres qui les masquent).
8. Une recherche sans résultat ne peut jamais produire `scanned-empty` ou
   `never-scanned-empty`.
9. La copy française est grammaticalement correcte pour 0, 1 et plusieurs
   missions, y compris les adjectifs `nouvelle(s)` et `prioritaire(s)`.

## Cas de test obligatoires

- `error + visibleCount > 0` → `error-cached` (incident)
- `error + visibleCount === 0` → `error-critical` (critical)
- `isOffline` → `offline` (incident)
- `brokenConnectorCount > 0` → `broken-sources` (critical)
- `newCount > 0` → `new-missions` (attention)
- `alertEnabled && highScoreCount > 0 && newCount === 0` → `priority-ready` (success)
- **`visibleCount === 0 && filterActive && totalMissionCount > 0`** → **`filtered-empty`** (attention, CTA « Effacer les filtres »)
- **`visibleCount === 0 && searchQuery !== '' && totalMissionCount > 0`** →
  **`filtered-empty`** avec copy de recherche et CTA « Effacer la recherche »
- **`visibleCount === 0 && hasCompletedScan === true && !(filterActive && totalMissionCount > 0)`** → **`scanned-empty`** (attention)
- **`visibleCount === 0 && hasCompletedScan === false`** → **`never-scanned-empty`** (neutral)
- `visibleCount > 0 && newCount === 0 && highScoreCount === 0` → `feed-ready` (success)

## Changements requis dans le code

1. **Type** : ajouter `hasCompletedScan: boolean`, `filterActive: boolean`,
   `totalMissionCount: number` à `FeedStoryInput`
2. **Fonction** : insérer la branche `filtered-empty` (filtres masquent tout)
   **avant** `scanned-empty` dans l'arbre de décision de `buildFeedStory`
3. **Page** : passer `filterActive: page.filterActive`,
   `totalMissionCount: page.totalMissions`, et
   `hasCompletedScan: controller.lastScanAt != null` au `buildFeedStory`
4. **Handler** : ajouter une branche dans `handleFeedStoryPrimaryAction` pour
   détecter `filtered-empty` et appeler `handleClearMissionFilters()`, **avant**
   la branche `scanned-empty` qui appelle `appNavigation.navigate('profile')`
5. **Tests** : couvrir les trois cas empty dans les unit tests

## Références

- **Signal canonique** : `scan-lifecycle.model.md` (contrat de `lastScanAt`)
- **Edge detection** : `scan-completion-delight.model.md` (usage de `lastScanAt` monotone)
- **Navigation** : `app-navigation.svelte.ts` (`navigate(page: Page)`)
