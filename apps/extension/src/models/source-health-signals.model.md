# Modèle — Signaux de santé des sources (Source Health Signals)

Statut : proposé (openspec/changes/source-health-signals)
Étend : [connector-health-workflow.model.md](../connector-health-workflow.model.md) (provenance des `ConnectorHealthRecord`, `BROKEN_PARSER_THRESHOLD`).
Type de modèle : **dérivation pure** (pas de machine à états — aucun effet de bord, aucune transition temporelle propre ; tout est fonction déterministe de `(input, now)`).

## 1. Objet

Produire, à partir des enregistrements persistés uniquement, un ensemble de **4 signaux de risque agrégés** affichés dans la carte « Santé des sources ». Chaque signal porte :

- `id` : identifiant canonique,
- `label` : libellé UI français,
- `detail` : phrase de contexte (chiffres du mois, seuils, délais),
- `value` : valeur numérique affichée (entier),
- `unit` : `'%'` ou `'count'`,
- `severity` : `'ok' | 'warn' | 'alert'`,
- `ratio` : 0..1, longueur de l'arc de jauge.

**Règle courte** : 100 % dérivé des enregistrements persistés. Aucune décision LLM, aucun état implicite, aucun libre-texte. `now` est injecté en paramètre.

## 2. Entrées (sources de données persistées)

| Champ               | Type                         | Source persistée                                                                            |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `healthRecords`     | `ConnectorHealthRecord[]`    | `connector_health_snapshots` (chrome.storage.local) via `shell/storage/connector-health.ts` |
| `persistedStatuses` | `PersistedConnectorStatus[]` | IndexedDB `connector statuses` via `shell/storage/db.ts` (`getConnectorStatuses`)           |
| `dedupStats`        | `DedupStats \| null`         | `scan_signal_stats` (chrome.storage.local, écrit par le service worker à la fin d'un scan)  |
| `scoreStats`        | `ScoreStats`                 | dérivé du catalogue de missions courante (missions dédupliquées + scorées déjà persistées)  |

Types annexes :

```ts
interface DedupStats {
  lastScanAt: number;
  rawCount: number;
  mergedCount: number;
  monthKey: string;
  monthMergedCount: number;
} // monthKey = 'YYYY-MM'
interface ScoreStats {
  totalScored: number;
  outOfTarget: number;
  connectorCount: number;
}
```

- `totalScored` : missions du catalogue avec `score != null`.
- `outOfTarget` : missions avec `score < 40` (grade D/F de `scoreToGrade`, cf. `core/types/score.ts`).
- `connectorCount` : nombre de `Mission.source` distincts parmi les missions scorées.

**Connecteurs actifs** = union des `connectorId` de `healthRecords` et de `persistedStatuses`.
Invariant : si cette union est vide → `computeSourceHealthSignals` retourne `{ signals: [], activeConnectorCount: 0 }` (état vide UI propre).

## 3. Les 4 signaux — définitions exactes

Constantes (exportées par le core, testées) :

| Constante                   | Valeur                                  | Rôle                               |
| --------------------------- | --------------------------------------- | ---------------------------------- |
| `DUPLICATES_WARN_RATE`      | 5 (%)                                   | au-dessus → warn                   |
| `DUPLICATES_ALERT_RATE`     | 15 (%)                                  | au-dessus → alert                  |
| `STALE_SOURCE_THRESHOLD_MS` | 48 × 3 600 000                          | retard au-delà de 48 h sans succès |
| `OFFTARGET_WARN_RATE`       | 20 (%)                                  | au-dessus → warn                   |
| `OFFTARGET_ALERT_RATE`      | 40 (%)                                  | au-dessus → alert                  |
| `SCORE_OUT_OF_TARGET`       | 40                                      | score < 40 = hors-cible            |
| `BROKEN_PARSER_THRESHOLD`   | 5 (importé de `parser-health-logic.ts`) | parser cassé                       |

### 3.1 `duplicates` — « Doublons »

- `value` = `dedupStats` absent ou `rawCount === 0` ? 0 : `round(mergedCount / rawCount × 100)` (%, taux de fusion du **dernier scan**).
- `detail` = `${monthMergedCount} fusionnée(s) ce mois` (pluriel si > 1 ; `monthMergedCount` du mois courant, remis à zéro au changement de mois par `buildDedupStatsUpdate`).
- `severity` : ok si `value < 5` ; warn si `5 ≤ value < 15` ; alert si `value ≥ 15`.
- `ratio` = `clamp(value / 100, 0, 1)`.

### 3.2 `parsers` — « Parsers suspects »

- `value` = nombre de `healthRecords` avec `consecutiveZeros > 0`.
- `detail` = `Seuil d'alerte à ${BROKEN_PARSER_THRESHOLD}` (soit « Seuil d'alerte à 5 »).
- `maxZeros` = max des `consecutiveZeros` (0 si aucune).
- `severity` : ok si `value === 0` ; warn si `0 < maxZeros < 5` ; alert si `maxZeros ≥ 5`.
- `ratio` = `clamp(maxZeros / BROKEN_PARSER_THRESHOLD, 0, 1)`.

### 3.3 `stale` — « Sources en retard »

Pour chaque connecteur actif, `lastSuccessAt` effectif = `healthRecord.lastSuccessAt ?? persistedStatus.lastSuccessAt ?? null`.
Un connecteur est **en retard** si `lastSuccessAt === null` ou `now − lastSuccessAt > 48 h`.

- `value` = nombre de connecteurs actifs en retard.
- `detail` = aucun retard → `Dernier succès < 48h` ; sinon `Dernier succès il y a ${maxDelayDays}j`, où `maxDelayDays = floor(max(now − lastSuccessAt) / 86 400 000)` sur les connecteurs en retard non-null ; les connecteurs sans succès sont libellés `Dernier succès : jamais`.
- `severity` : ok si `value === 0` ; warn si `value === 1` ; alert si `value ≥ 2`.
- `ratio` = `clamp(value / activeConnectorCount, 0, 1)`.

### 3.4 `offtarget` — « Hors-cible »

- `value` = `totalScored === 0` ? 0 : `round(outOfTarget / totalScored × 100)` (%).
- `detail` = `${outOfTarget} mission(s) · ${connectorCount} connecteur(s)` (pluriels).
- `severity` : ok si `value < 20` ; warn si `20 ≤ value < 40` ; alert si `value ≥ 40`.
- `ratio` = `clamp(value / 100, 0, 1)`.

## 4. Ordre et mise en avant

1. Tri : `severity` décroissante (`alert` > `warn` > `ok`), puis `ratio` décroissant, puis ordre canonique `duplicates → parsers → stale → offtarget` (déterminisme total).
2. Mise en avant (bleu `blueprint-blue`) : **uniquement** le premier signal du tri, et seulement si sa `severity` est `warn` ou `alert`. Si tous les signaux sont `ok`, **aucun** n'est mis en avant (tout en gris) — pas d'alarme quand il n'y a rien à signaler.

## 5. Invariants (testés)

1. `0 ≤ ratio ≤ 1` pour tout signal, quelles que soient les entrées.
2. `value ≥ 0` ; `unit ∈ {'%', 'count'}` ; `severity ∈ {'ok','warn','alert'}`.
3. Résultat trié selon §4, exactement 4 signaux dès qu'il existe ≥ 1 connecteur actif.
4. Union vide ⇒ sortie vide ; aucune division par zéro (dénominateurs testés avant usage).
5. Fonction pure : mêmes `(input, now)` ⇒ même sortie. Aucun `Date.now()`, `Math.random()`, I/O ou `console` dans le core.
6. `scoreStats` et `dedupStats` sont calculés par des fonctions pures dédiées (`computeScoreStats`, `buildDedupStatsUpdate`) ; la persistance (`shell/storage/scan-signal-stats.ts`) et l'écriture par le service worker sont les seuls effets de bord.
7. Aucune transition d'état ne dépend de ce module : les signaux sont des **indicateurs** consommés par l'UI, jamais une source de décision de workflow.

## 6. Cycle de vie des `DedupStats`

```
Scan terminé (SW, persistPostCommitEffects)
   │  rawCount = |sourceMissions| (avant dédup), mergedCount = rawCount − |missions|
   ▼
buildDedupStatsUpdate(prev, {rawCount, mergedCount}, now)   ← core pur
   │  monthKey = YYYY-MM(now) ; si prev?.monthKey ≠ monthKey → monthMergedCount = 0
   │  sinon monthMergedCount = prev.monthMergedCount + mergedCount
   ▼
chrome.storage.local 'scan_signal_stats'                    ← shell (seul effet de bord)
   │
   ▼
Side panel lit au bootstrap → computeSourceHealthSignals
```

Écriture tolérante aux pannes : si la persistance échoue, le signal `duplicates` vaut 0 (pas d'exception remontée à l'UI).

## 7. Hors périmètre (non-goals)

- Historique des signaux / tendances hebdomadaires.
- Décision ou transition d'état pilotée par ces signaux (notification, re-scan automatique).
- Modification de `SourceHealthPanel.svelte` (diagnostic par source, rôle distinct de la carte agrégée).
