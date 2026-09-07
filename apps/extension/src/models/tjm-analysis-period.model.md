# TJM Analysis Period — Model

> Source de vérité pour la sélection de période de l'analyse TJM (page « Analyse TJM »).
> Proposition Mobbin Navattic : presets de période au-dessus des métriques du dashboard.

## Contexte

L'analyse TJM (`core/tjm-history/analyzeTJMHistory`) agrège aujourd'hui **tout** l'historique
des records (`TJMHistory.records`), quel que soit leur âge. Un utilisateur qui scanne depuis
6 mois voit des médianes tirées par des données anciennes. Les dashboards de marché (référence
Navattic) proposent des fenêtres de période : **7 jours / 30 jours / Tout**.

## État

```
TJMPeriod = '7d' | '30d' | 'all'

PageTJMState {
  period: TJMPeriod          // défaut 'all'
  region: TJMRegion | null   // existant, orthogonal
  analysis: TJMAnalysis | null
  status: 'loading' | 'ready' | 'error'   // existant
}
```

- `period` est un état UI **non persisté** (comme `region`) : réinitialisé à `'all'` à chaque
  ouverture de la page. Rationale : la période est une question ponctuelle (« que dit le marché
  récemment ? »), pas une préférence durable.
- Défaut `'all'` → comportement strictement identique à l'existant (compatibilité ascendante).

## Événements

| Événement                     | Garde                    | Effet                                                    |
| ----------------------------- | ------------------------ | -------------------------------------------------------- |
| `SELECT_PERIOD(p: TJMPeriod)` | `p ∈ {'7d','30d','all'}` | `period = p` → ré-émission `GET_TJM_ANALYSIS { period }` |
| `SCAN_COMPLETE`               | —                        | ré-analyse avec la période courante                      |
| `PROFILE_UPDATED`             | —                        | recharge profil + ré-analyse avec la période courante    |
| `REFRESH`                     | —                        | ré-analyse avec la période courante                      |

Transitions libres entre les 3 valeurs (aucune garde d'ordre). Toute autre valeur est rejetée
par le schéma Zod du message (enum strict) — une période inconnue ne peut jamais atteindre le
cœur.

## Fonction pure de fenêtrage

```ts
// core/tjm-history — pur, déterministe
filterTJMHistoryByPeriod(history: TJMHistory, period: TJMPeriod, now: Date): TJMHistory
```

- `'all'` → retourne `history` tel quel (identité — jamais une copie filtrée par date).
- `'7d'` / `'30d'` → `cutoff = dateOnlyISO(now − N×24h)` ; ne garde que
  `record.date >= cutoff` (comparaison lexicale sur ISO date-only = chronologique).
- `dateOnlyISO(d) = d.toISOString().slice(0, 10)` — cohérent avec le format des records
  (`"2026-04-01"`), bornes **inclusives**.

## Composition des filtres

`period ∧ stacks ∧ region` se combinent en ET sur `records` avant analyse :
`buildTJMAnalysis(history, stacks, region, period, now)` applique la fenêtre **en dernier**
(after stacks/region), puis délègue à `analyzeTJMHistory`. L'ordre n'affecte pas le résultat
(ET commutatif) mais la fenêtre en dernier garantit que `dataPoints` reflète la fenêtre.

## Fenêtre vide

Si aucun record dans la fenêtre → `analyzeTJMHistory` retourne `null` → l'état vide existant
du dashboard s'affiche, avec une description **adaptée à la période** (« aucune mission
stockée dans les 7 derniers jours ») quand `period ≠ 'all'` et aucune erreur.

**Interdit** : fallback implicite vers une fenêtre plus large. Une transition implicite
pilotée par les données masquerait la vacuité de la fenêtre — l'utilisateur doit voir que
7 jours ne contiennent rien et pouvoir basculer explicitement vers « Tout ».

## Invariants

1. `period` est toujours une des 3 valeurs ; le schéma message rejette tout le reste.
2. `filterTJMHistoryByPeriod(h, 'all', _) === h` (identité, testé).
3. `filterTJMHistoryByPeriod` ne lit jamais l'horloge : `now` est injecté.
4. La sortie de `'7d'` est un sous-ensemble de celle de `'30d'`, elle-même sous-ensemble de
   `'all'`, pour un même `history` et un même `now` (monotonie, testé).
5. `dataPoints` de l'analyse = nombre de records dans la fenêtre composée (stacks ∧ region ∧
   period).
6. Le contrôle UI est un `radiogroup` (`role="radiogroup"`, options `role="radio"` +
   `aria-checked`, navigation clavier flèches) — c'est un choix parmi 3, pas un toggle.
7. Le changement de période ne déclenche qu'UNE ré-analyse (pas de rechargement profil).
8. Aucune décision de transition n'est déléguée à un LLM (n/a — filtrage déterministe).

## Interface UI (référence Navattic)

Segmented control 3 options dans le header de page, aligné avec le filtre région :
`[ 7 jours | 30 jours | Tout ]` — fond `page-canvas`, option active `surface-white` + texte
`text-primary` + ombre légère. Labels : « 7 jours », « 30 jours », « Tout ».
