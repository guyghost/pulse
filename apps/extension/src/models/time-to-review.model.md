# Time to Review — Model

> Source de vérité pour la métrique « Time to review » : délai entre la **capture** d'une
> mission par Pulse et sa **première consultation** par l'utilisateur, agrégé en p50/p95
> sur 30 jours glissants. Inspirée des cartes « Time to approve » des dashboards produit.

## Contexte

Pulse sait quand une mission entre dans le catalogue (scan) et quand l'utilisateur la voit
dans le feed (marquage seen). Le lien entre les deux n'est journalisé nulle part : la carte
« Time to review » mesure la **réactivité de consultation** du feed.

Les champs réels de `Mission` (`core/types/mission.ts`) n'exposent **pas** de
`firstSeenAt` : le moment de capture est `scrapedAt` (ISO du scan qui a fait entrer la
mission). La consultation doit être journalisée : `firstViewedAt`.

## Signaux

| Signal            | Producteur                                           | Format   |
| ----------------- | ---------------------------------------------------- | -------- |
| Mission capturée  | `Mission.scrapedAt` (existant)                       | ISO 8601 |
| Mission consultée | Journal `firstViewedAt` écrit au mark-seen côté feed | ISO 8601 |

### Définition de « consultation »

Une mission est **consultée** quand elle devient vue dans le feed utilisateur :

- `handleMissionSeen` (mission entrant dans le viewport, flush batché `flushSeenIds`) ;
- `persistSeen` (mission validée dans la pile d'arrivée `MissionArrivalStack`).

Les marquages **automatiques** — notifications (`background/index.ts`) et digest quotidien
(`daily-digest.ts`) — ne sont **pas** des consultations : l'utilisateur n'a pas vu la
mission dans Pulse. Ils continuent d'alimenter `seenIds` mais **ne journalisent pas**
`firstViewedAt`. Un mission notifiée-puis-vue a donc un délai mesuré depuis la capture,
jamais depuis la notification.

### Journal de première consultation (shell)

```ts
// core/seen/first-viewed.ts — types purs
type ReviewJournal = Record<string, { firstViewedAt: string; capturedAt: string | null }>;
```

- Persisté dans `chrome.storage.local` (clé `reviewJournal`) par
  `shell/storage/review-journal.ts` — la clé est écrite **au moment du mark-seen feed** :
  c'est un événement shell déterministe, pas une décision LLM.
- `capturedAt` est un **snapshot** de `scrapedAt` pris au moment du journaling : le journal
  reste autoportant si la mission est purgée de l'IndexedDB.
- **First-write-wins** : la première consultation prime, jamais écrasée par une suivante.
- **Cap 2000 entrées** (aligné sur `MAX_SEEN_IDS`) — éviction des consultations les plus
  anciennes (tri sur `firstViewedAt`).

## Fonctions pures (core)

```ts
// core/seen/first-viewed.ts — merge pur du journal (first-write-wins, cap, déterministe)
mergeFirstViewed(current: ReviewJournal, entries: FirstViewedEntryInput[]): ReviewJournal;

// core/metrics/time-to-review.ts
buildReviewEvents(missions: Mission[], journal: ReviewJournal): ReviewEventInput[];
computeTimeToReview(events: ReviewEventInput[], now: Date): TimeToReviewResult;
percentile(values: number[], p: 50 | 95): number | null;
```

- `buildReviewEvents` : union des missions connues (DB) et du journal ; une mission de la
  DB sans entrée de journal = événement non consulté (`firstViewedAt: null`) ; une entrée
  de journal orpheline (mission purgée) utilise le `capturedAt` snapshot.
- `now` est **toujours injecté** par le shell. Zéro I/O, zéro `Date.now()` dans le core.

### Définition du délai

`delayHours = (firstViewedAt − capturedAt) / 3 600 000`

| Cas                                                | Traitement                                              |
| -------------------------------------------------- | ------------------------------------------------------- |
| Mission non vue (`firstViewedAt: null`)            | Exclue du p50/p95, **comptée dans « non vues »**        |
| `capturedAt` irrésoluble (journal orphelin)        | Exclue du p50/p95 **et** de « non vues » (incomparable) |
| `firstViewedAt < capturedAt` (horloge incohérente) | Comptée comme vue, exclue du p50/p95 (délai non défini) |
| `capturedAt > now` (horloge future)                | Exclue entièrement de la fenêtre                        |

### Fenêtres

- **Période courante** : `capturedAt ∈ [now − 30 j, now]` → KPIs + séries.
- **Période précédente** : `capturedAt ∈ [now − 60 j, now − 30 j)` → deltas uniquement.
- **Séries quotidiennes** : 30 points, jour UTC de `capturedAt` (`iso.slice(0, 10)`),
  p50/p95 des délais des missions capturées ce jour-là (`null` si aucun délai ce jour).

### Percentiles et deltas

- Percentile par interpolation linéaire : `idx = (p / 100) × (n − 1)` sur valeurs triées.
- `delta = valeur(courante) − valeur(précédente)` ; `null` si l'une des deux périodes
  n'a pas de valeur. **Amélioration = delta < 0** (délai ou part de non-vues qui baisse)
  → rendu en bleu ; sinon neutre.
- p50 affiché en heures (1 décimale), p95 en heures (arrondi), non-vues en %
  (delta en points, « pt »).

### Sortie

```ts
interface TimeToReviewResult {
  hasData: boolean; // ≥ 1 événement dans la fenêtre courante
  p50: { value: number | null; delta: number | null }; // heures
  p95: { value: number | null; delta: number | null }; // heures
  unviewed: { value: number | null; delta: number | null }; // part 0..1
  series: Array<{ day: string; p50: number | null; p95: number | null }>; // 30 points asc.
}
```

## États UI

```
status: 'loading' → 'ready'        (state module time-to-review.svelte.ts)
ready ∧ ¬hasData  → état vide      (jamais de zéro trompeur)
ready ∧ hasData   → KPIs + graphe
```

Événements : `MOUNT → load()` (lectures `getMissions` via bridge + journal via
chrome.storage) ; `RETRY` → `load()`. Aucune transition libre, aucun texte libre pilote.

## Interface UI (carte)

- Organism `organisms/TimeToReviewCard.svelte` + molecule `molecules/TimeToReviewKpi.svelte`
  (props uniquement). Montage lazy dans la colonne avancée du FeedPage, même pattern que
  `SourceHealthPanel` / `FeedActionDashboard`.
- En-tête : pastille grise + icône courbe (`activity`), titre « Time to review »,
  sous-titre « Heures entre capture et première consultation · 30 jours », légende
  p50 (bleu) / p95 (gris).
- Graphe : SVG inline **sans dépendance externe** — aire bleu clair (p50 quotidien), ligne
  grise (p95), échelle Y fixe 0–48 h (ticks 0/12/24/48, valeurs bornées), dates X
  (premier/dernier jour, « 14 août » → « 11 sept »), point final cerclé sur la dernière
  valeur p50 non nulle. `role="img"` + `aria-label` descriptif.
- État vide : « Les statistiques de consultation se constituent à l'usage ».

## Invariants

1. `p50 ≤ p95` dès lors que les deux sont non nuls (même population, même interpolation).
2. `series.length === 30`, jours strictement croissants, dernier jour = jour UTC de `now`.
3. `0 ≤ unviewed.value ≤ 1` ; `unviewed.value === null` ⟺ aucun événement comparable.
4. Aucune donnée → `hasData: false` et valeurs `null` — **jamais** de 0 trompeur.
5. Le core ne lit jamais l'horloge ; `now` injecté par le shell.
6. La journalisation est un événement shell au mark-seen feed ; les marquages automatiques
   (notification, digest) ne journalisent pas ; first-write-wins (invariant 7).
7. La première consultation d'une mission n'est jamais écrasée ni recalculée.
8. Aucune décision de transition n'est déléguée à un LLM (calcul déterministe).
9. Le side panel n'accède au journal qu'via le shell (`shell/storage/review-journal.ts`),
   jamais à `chrome.*` directement hors shell.
