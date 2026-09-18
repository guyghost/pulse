# Modèle — Carte « Scans de la semaine »

## Intention

Présenter les runs de scan de la semaine en cours, un item par connecteur (inspiration : carte « Payment runs »). La carte répond à une seule question : _quels connecteurs ont tourné cette semaine, avec quel résultat, et combien de missions ont été récupérées ?_

**Décision explicite : ceci est une PROJECTION DE PRÉSENTATION PURE — pas une machine d'état, pas de XState.** La carte n'introduit aucune transition d'état, aucun événement, aucun effet de bord. Elle dérive uniquement de l'affichage des statuts déjà persistés par le scanner (`ConnectorStatus` / `PersistedConnectorStatus`). Toute transition d'état reste la propriété exclusive du scanner (`src/lib/shell/scan/scanner.ts`) et de ses connecteurs.

## Source canonique

- `src/models/connector-status.model.md` et `src/lib/core/types/connector-status.ts` — états et statuts (source unique de vérité).
- `src/lib/shell/storage/connector-health.ts` / `src/lib/shell/scan/scanner.ts` — persistance/lecture des statuts (seuls canaux autorisés).
- Implémentation core : `src/lib/core/scan/scan-runs-presentation.ts` (fonctions pures).
- Store UI : `src/lib/state/scan-runs.svelte.ts` ; surfaces : `src/ui/organisms/ScanRunsPanel.svelte`, `src/ui/molecules/ScanRunItem.svelte`.

## Données d'entrée (enregistrements unifiés)

Chaque connecteur produit **au plus un enregistrement** : le statut live (`ConnectorStatus`, présent uniquement pendant un scan) fusionné avec le statut persisté (`PersistedConnectorStatus`). Fusion (`mergeScanRunRecords`) — **le live gagne** sur le persisté par `connectorId`, avec une seule exception : `lastSyncAt` du live retombe sur celui du persisté si le live n'en fournit pas (connecteur `pending` en file d'un nouveau scan).

| Champ           | Live (`ConnectorStatus`) | Persisté (`PersistedConnectorStatus`) |
| --------------- | ------------------------ | ------------------------------------- |
| `state`         | `state` (tous les états) | `lastState` (borné à `done`/`error`)  |
| `missionsCount` | `missionsCount`          | `missionsCount`                       |
| `startedAt`     | `startedAt`              | — (non persisté)                      |
| `lastSyncAt`    | `completedAt`            | `lastSyncAt`                          |

## Définition d'un « run de la semaine »

- Horodatage du run (`runAt`), résolu **dans le core**, fonction de l'état :
  - `pending` / `detecting` / `fetching` / `retrying` → `startedAt`, sinon repli sur `lastSyncAt` (run précédent hérité du persisté) ;
  - `done` / `error` → `lastSyncAt` (la spec : date de fin si terminé).
- **Bornes de semaine** : `[weekStart, now]` inclusif aux deux extrémités. `weekStart = getWeekStart(now)` = lundi 00:00 heure locale (`weekStartsOn: 1` par défaut, paramétrable).
- `now` et `weekStart` sont **toujours injectés en paramètre** — jamais `Date.now()` dans le core.
- Un enregistrement sans `runAt` résoluble est **exclu** de la carte (il n'y a rien à dater).

## Projection de présentation (mapping pur `ConnectorState` → rendu)

| État        | Tone        | Icône (UI)                           | Barre 6 segments                  | Sous-titre item                                  |
| ----------- | ----------- | ------------------------------------ | --------------------------------- | ------------------------------------------------ |
| `done`      | `done`      | check bleu dans pastille             | 6/6 bleue (progress `1`)          | date/heure de `runAt`                            |
| `fetching`  | `active`    | cercle pointillé gris                | partielle bleue (progress `0.5`)  | date/heure de `runAt`                            |
| `retrying`  | `active`    | spinner/pointillés bleus             | partielle bleue (progress `0.5`)  | date/heure de `runAt`                            |
| `detecting` | `active`    | cercle pointillé gris                | partielle bleue (progress `0.25`) | date/heure de `runAt`                            |
| `pending`   | `waiting`   | cercle pointillé gris                | grise vide (progress `0`)         | date/heure de `runAt` (run précédent)            |
| `error`     | `attention` | icône « en attente » grise (`clock`) | grise vide (progress `0`)         | libellé **« À revoir »** (copie UI, pas de date) |

- `progress` est un `0..1` **indicatif** borné dans le core (`clamp01`) ; le rendu segmenté (`Math.round(progress × 6)`) est un choix de présentation UI, recalculé à l'affichage. La barre n'encode aucune sémantique métier au-delà de cette projection.
- Le **timestamp brut** (`runAt: number`) est renvoyé par le core ; **le formatage (« Jeu 11 · 09:00 ») est fait dans l'UI** (molecule), pour garder le core sans `Intl`.

## Tri (déterministe, purement dérivé)

1. `active` (`detecting`/`fetching`/`retrying`) — en cours d'abord ;
2. `attention` (`error`) — à traiter ;
3. `done` — les plus récents (`runAt` décroissant) ;
4. `waiting` (`pending`).

À priorité et `runAt` égaux : `connectorId` croissant (tiebreak stable, sans `Math.random()`).

## Invariants

1. **Aucune transition d'état nouvelle.** La carte ne mute aucun statut ; `ConnectorState` reste la seule source des états.
2. **Pureté du core** : pas de fetch/IndexedDB/chrome/async/`Date.now()`/`Math.random()`/`console` ; sortie déterministe pour des entrées identiques.
3. **Pas d'écriture** : la carte lit uniquement ; elle ne persiste ni statut, ni historique, ni préférence.
4. **Un item = un connecteur actif** ayant un `runAt` datable dans la semaine en cours ; `N runs` = nombre d'items affichés.
5. **Aucune décision LLM** : aucun signal IA n'intervient dans cette carte.
6. Le champ `missionsCount` est assaini (`>= 0`) ; les timestamps non finis sont traités comme absents (`null`).
7. La carte est **masquée** quand la liste dérivée est vide (aucun état vide dédié).

## Revue des cas

| Cas                                   | Comportement                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Nominal (scan terminé)                | Items `done` triés par récence, compteur `N runs` correct                                                             |
| Scan en cours                         | Items `active`/`waiting` en tête ; `missionsCount` partiel affiché tel quel                                           |
| Connecteur en erreur                  | Item `attention`, barre grise, libellé « À revoir » ; pas d'alarme                                                    |
| Annulation de scan                    | Le live disparaît, repli sur le persisté — la carte revient au dernier état connu, sans état intermédiaire inventé    |
| Permissions/connecteur exclu au build | Connecteur absent des statuts → absent de la carte (rien à faire)                                                     |
| États terminaux                       | `done`/`error` persistés restent affichés toute la semaine en cours, puis sortent naturellement aux bornes de semaine |
| Horloge/hors semaine                  | `runAt > now` ou `runAt < weekStart` → item exclu (jamais projeté « dans le futur »)                                  |

## Limites documentées

- **Pas d'historisation par semaine** : la persistance ne conserve que le dernier statut par connecteur. La carte montre donc **au plus un run par connecteur** ; `N` ≈ nombre de connecteurs actifs, pas le nombre réel de déclenchements de la semaine.
- Les bornes de semaine sont recalculées à la dérivation (re-render) ; le passage à la semaine suivante se reflète à la prochaine mise à jour de l'état, pas à la seconde près.
