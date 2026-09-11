# Source Health Signals

## Why

La vue « Santé des sources » montre aujourd'hui un diagnostic **par connecteur** (`SourceHealthPanel`) mais aucune vue **agrégée des signaux de risque** : doublons, parsers qui renvoient 0 mission, sources sans succès récent, missions hors-cible. L'utilisateur doit déduire lui-même l'état de santé global de ses sources. Une carte compacte type « Vendor risk » (4 jauges demi-cercle) rend ces signaux lisibles en un coup d'œil.

## What changes

- **Core pur** `core/connectors/source-health-signals.ts` : `computeSourceHealthSignals(input, now)` dérive 4 signaux (id, label, detail, value, unit, severity ok/warn/alert, ratio 0..1), triés par sévérité ; helpers purs `computeScoreStats(missions)` et `buildDedupStatsUpdate(prev, next, now)`.
- **Shell** : nouveau module de persistance `shell/storage/scan-signal-stats.ts` (chrome.storage.local, clé `scan_signal_stats`) écrit par le service worker à la fin d'un scan (rawCount/mergedCount + compteur mensuel) ; lecture au bootstrap du side panel.
- **UI** : atome `GaugeArc.svelte` (jauge demi-cercle SVG ~48px, props only) et organisme `SourceHealthSignalsCard.svelte` (en-tête pastille grise + triangle d'alerte, 4 lignes de signal, valeurs en mono, ligne la plus préoccupante en bleu, état vide propre), monté dans `FeedPage` à côté de `SourceHealthPanel`.
- **Modèle** : `src/models/source-health-signals.model.md` (définitions, seuils, invariants) ; testé sans mocks dans `tests/unit/connectors/source-health-signals.test.ts`.

## Non-goals

- Aucune décision de workflow pilotée par ces signaux (pas de notification ni re-scan automatique).
- Pas d'historique / tendance temporelle.
- `SourceHealthPanel.svelte` reste inchangé (rôle : diagnostic par source).

## Model

`source-health-signals.model.md` — dérivation pure, invariants : ratios bornés [0,1], tri déterministe (sévérité desc → ratio desc → ordre canonique), mise en avant bleu uniquement si sévérité ∈ {warn, alert}, union vide ⇒ sortie vide, `now` injecté.

## Impact

**Affected features**: feed (carte avancée), connecteurs (lecture seule des enregistrements existants), scan (écriture additive des stats de dédup).
**Affected specs**: aucune spec formelle existante ; modèle ajouté.
**Files**:

| Fichier                                               | Action                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `src/models/source-health-signals.model.md`           | créer                                                      |
| `src/lib/core/connectors/source-health-signals.ts`    | créer                                                      |
| `src/lib/shell/storage/scan-signal-stats.ts`          | créer                                                      |
| `src/background/index.ts`                             | ~5 lignes additives (écriture des stats au commit du scan) |
| `src/ui/atoms/GaugeArc.svelte`                        | créer                                                      |
| `src/ui/organisms/SourceHealthSignalsCard.svelte`     | créer                                                      |
| `src/ui/pages/FeedPage.svelte`                        | import lazy + 2 montages additifs                          |
| `tests/unit/connectors/source-health-signals.test.ts` | créer                                                      |

Risque de conflit : faible — hunks additifs uniquement dans les fichiers partagés (`background/index.ts`, `FeedPage.svelte`).

## Open questions

Aucune bloquante ; les seuils (5/15 %, 48 h, 20/40 %) sont des constantes de modèle ajustables après retour terrain.
