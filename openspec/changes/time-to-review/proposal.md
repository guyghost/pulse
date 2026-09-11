# Proposal : analytics « Time to review »

## Pourquoi

Le feed mesure ce qui entre (scans, TJM, santé des connecteurs) mais pas la **réactivité
de consultation** : combien de temps s'écoule entre la capture d'une mission par Pulse et
sa première consultation par l'utilisateur. Cette latence signale un feed qui n'arrive pas
à capter l'attention (missions bruitées, notifications tardives, scoring décalé).

## Quoi

- **Journal de première consultation** : au mark-seen côté feed (viewport ou pile
  d'arrivée), le shell persiste `missionId → { firstViewedAt, capturedAt }` dans
  `chrome.storage.local` (first-write-wins, cap 2000). Les marquages automatiques
  (notification, digest) ne journalisent pas.
- **Calcul pur** : `core/metrics/time-to-review.ts` — p50/p95 des délais en heures sur
  30 jours glissants, part de missions non vues, deltas vs la période précédente
  (N−30 j → N−60 j), séries quotidiennes p50/p95. `now` injecté, zéro I/O.
- **Carte « Time to review »** : organism `TimeToReviewCard.svelte` (lazy dans la colonne
  avancée du FeedPage) + molecule `TimeToReviewKpi.svelte` — en-tête pastille + légende,
  rangée de KPIs (p50, p95, non vues, deltas bleus si amélioration), graphe SVG inline
  sans dépendance (aire p50, ligne p95, point final cerclé), état vide explicite.

## Impact

- Nouveaux fichiers core/shell/state/UI + tests unitaires purs (mock-free).
- Fichiers partagés touchés **en une seule ligne** : `storage/index.ts`,
  `organisms/index.ts`, `feed-page.svelte.ts` (2 appels journaling aux points de
  mark-seen existants), `FeedPage.svelte` (montage lazy).
- Aucun impact sur les autres features en cours (review-queue, scan-runs-week,
  source-health-signals) ni sur le schéma des missions existantes.

## Modèle

Source de vérité : `apps/extension/src/models/time-to-review.model.md`.
