# TJM Market Overview — Model

> Source de vérité pour l'en-tête KPI du dashboard TJM (« Analyse TJM »).
> Proposition Mobbin Cloudflare : cartes KPI big-number (médiane, cible,
> tendance) avec sparkline de la série agrégée.

## Contexte

Le dashboard enterre la médiane du segment sélectionné dans les cartes par
niveau. Les dashboards de référence (Cloudflare) ouvrent la page par un bandeau
KPI : grands chiffres + inline sparkline, avant tout contenu narratif.

## Projection KPI (pure, depuis `TJMAnalysis` + profil)

| KPI         | Source                                    | Format                   |
| ----------- | ----------------------------------------- | ------------------------ |
| Médiane     | `analysis[level].median`                  | `500 €/j`                |
| Votre cible | `profile.tjmMin–tjmMax` (si renseigné)    | `450–550 €/j`, sinon `—` |
| Tendance    | `analysis.trend` + `analysis.trendDetail` | flèche + libellé         |

- `level` = niveau de séniorité du profil (déjà calculé par la page). Aucun
  nouveau calcul : le bandeau est une **projection pure** de l'analyse existante.

## Série sparkline — extension du core

```ts
// core/types/tjm.ts
interface TJMSeriesPoint { date: string; average: number }
interface TJMAnalysis { /* existant */ series: TJMSeriesPoint[] }

// core/tjm-history — pur
buildTJMSeries(records: TJMRecord[], bucketCount = 12): TJMSeriesPoint[]
```

- Agrège les records par **date** (`average` pondéré par `sampleCount`),
  trie par date croissante, puis ré-échantillonne en au plus `bucketCount`
  points contigus (moyenne pondérée par bucket).
- Invariants : série **triée chronologiquement**, vide si `records` vide, un
  point par bucket au maximum, chaque `average > 0`.
- La sparkline ne sert qu'à montrer l'allure (pente) — pas de lecture de
  valeur point à point exigée ; l'axe Y est normalisé min–max de la série.

## Événements

Aucun nouvel événement : le bandeau consomme `GET_TJM_ANALYSIS` existant et le
profil déjà chargé par la page. Changement de période/région → nouvelle analyse
→ KPI et sparkline se re-projettent.

## Invariants

1. Aucun calcul dans le shell ni dans le markup : KPI et série viennent du core.
2. Si `series.length < 2` → la sparkline est masquée (pas de ligne à 1 point).
3. Si la cible profil est absente → le KPI cible affiche `—`, jamais `0`.
4. La médiane affichée est toujours celle du niveau sélectionné, cohérente avec
   la carte de niveau correspondante.
