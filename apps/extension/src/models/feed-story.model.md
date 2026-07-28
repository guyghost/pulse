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

## États de présentation

Six états distincts, avec **précédence stricte** (de haut en bas) :

| État                  | Sévérité    | Condition                                              | Intention                                         |
| --------------------- | ----------- | ------------------------------------------------------ | ------------------------------------------------- |
| `error-cached`        | `incident`  | `error != null && visibleCount > 0`                    | Données en cache disponibles, scan interrompu     |
| `error-critical`      | `critical`  | `error != null && visibleCount === 0`                  | Aucune donnée disponible, scan impossible         |
| `offline`             | `incident`  | `isOffline`                                            | Hors ligne, données en cache disponibles          |
| `broken-sources`      | `critical`  | `brokenConnectorCount > 0`                             | Sources cassées, feed incomplet                   |
| `new-missions`        | `attention` | `newCount > 0`                                         | Nouvelles missions à traiter, prioritaires ou non |
| `priority-ready`      | `success`   | `alertEnabled && highScoreCount > 0 && newCount === 0` | Missions prioritaires disponibles (seuil dépassé) |
| `scanned-empty`       | `attention` | `visibleCount === 0 && hasCompletedScan`               | **Scan terminé, 0 résultat — ajuster le profil**  |
| `never-scanned-empty` | `neutral`   | `visibleCount === 0 && !hasCompletedScan`              | Premier lancement, inviter au scan                |
| `feed-ready`          | `success`   | _défaut final_                                         | Feed prêt, aucune action requise                  |

**Précédence** : erreur > offline > sources cassées > nouvelles > prioritaires >
scanned-empty > never-scanned > feed-ready.

### Nouveauté : distinction des empty states

Avant ce modèle, `visibleCount === 0` affichait toujours un neutral CTA "Lancez
un premier scan" — ambiguïté P0 quand un scan a **déjà terminé** et légitimement
trouvé zéro match.

**Signal discriminant** : `hasCompletedScan` (dérivé de `controller.lastScanAt != null`)

- `lastScanAt === null` → jamais scanné → `never-scanned-empty` (neutral, CTA scan)
- `lastScanAt != null` → déjà scanné → `scanned-empty` (attention, CTA profil)

Invariant : `lastScanAt` est monotone (uniquement mis à jour sur succès scan),
donc `hasCompletedScan` est un edge-detector fiable. Cf. `scan-lifecycle.model.md`
et `scan-completion-delight.model.md` pour le contrat de `lastScanAt`.

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
  hasCompletedScan: boolean; // ← ajouté pour discriminer les empty states
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
| **`scanned-empty`**   | **`Ajuster le profil`**   | **`appNavigation.navigate('profile')`** |
| `never-scanned-empty` | `Lancer le scan`          | `handleMissionFeedScanAction()`         |
| `feed-ready`          | `Voir le feed`            | `scrollToMissionFeed()`                 |

**Nouveauté** : `scanned-empty` route vers la page **Profile** pour permettre
l'ajustement des critères — pas vers un nouveau scan.

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
4. `scanned-empty` et `never-scanned-empty` sont **mutuellement exclusifs** :
   `hasCompletedScan` est le discriminant booléen.
5. Le handler `scanned-empty` **ne lance jamais de scan** — il route vers Profile.
6. `hasCompletedScan` est monotone (une fois `true`, reste `true` sauf reset app).

## Cas de test obligatoires

- `error + visibleCount > 0` → `error-cached` (incident)
- `error + visibleCount === 0` → `error-critical` (critical)
- `isOffline` → `offline` (incident)
- `brokenConnectorCount > 0` → `broken-sources` (critical)
- `newCount > 0` → `new-missions` (attention)
- `alertEnabled && highScoreCount > 0 && newCount === 0` → `priority-ready` (success)
- **`visibleCount === 0 && hasCompletedScan === true`** → **`scanned-empty`** (attention)
- **`visibleCount === 0 && hasCompletedScan === false`** → **`never-scanned-empty`** (neutral)
- `visibleCount > 0 && newCount === 0 && highScoreCount === 0` → `feed-ready` (success)

## Changements requis dans le code

1. **Type** : ajouter `hasCompletedScan: boolean` à `FeedStoryInput`
2. **Fonction** : insérer la branche `scanned-empty` avant `never-scanned-empty`
   dans l'arbre de décision de `buildFeedStory`
3. **Page** : passer `hasCompletedScan: controller.lastScanAt != null` au
   `buildFeedStory` dans le `$derived`
4. **Handler** : ajouter une branche dans `handleFeedStoryPrimaryAction` pour
   détecter `scanned-empty` et appeler `appNavigation.navigate('profile')`
5. **Tests** : couvrir les deux nouveaux cas empty dans les unit tests

## Références

- **Signal canonique** : `scan-lifecycle.model.md` (contrat de `lastScanAt`)
- **Edge detection** : `scan-completion-delight.model.md` (usage de `lastScanAt` monotone)
- **Navigation** : `app-navigation.svelte.ts` (`navigate(page: Page)`)
