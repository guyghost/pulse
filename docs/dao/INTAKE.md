# Règles d'intake des propositions (DAO MissionPulse)

> Issue de la proposition #140 (gouvernance) — vise à éviter la re-saturation
> du backlog constatée deux fois : 47 propositions bruit (#137) puis 7 doublons
> de roundtable (#140-146).

## 1. Déduplication avant création

Avant `dao_propose` / `swarm-dao propose` :

1. Lister les propositions ouvertes et récemment approuvées
   (`swarm-dao list --status open|approved`).
2. Comparer titre normalisé + description sémantique. Si un équivalent existe :
   **ne pas créer** — enrichir l'existant via `dao_update_proposal`.
3. Une idée ≠ une proposition par agent : si la roundtable converge (N agents,
   même idée), produire **1** proposition consolidée, pas N.

## 2. Qualité minimale d'une proposition

Une proposition doit porter :

- un `problemStatement` factuel (fichier:ligne, mesure, log — pas une opinion) ;
- des **acceptance criteria vérifiables** (commande ou observation qui fait foi) ;
- un `rollbackConditions` (quand annuler) ;
- des `affectedPaths` exhaustifs (utilisé par le dry-run).

## 3. Capacité du backlog

- Le backlog `open` plafonne à **10 propositions**. Au-delà : pas de nouvelle
  création tant que le stock n'est pas écoulé (exécuter ou rejeter).
- Les propositions approuvées non exécutées depuis > 2 cycles d'amélioration
  sont réexaminées en priorité.

## 4. Exécution unique

Quand plusieurs propositions approuvées couvrent la même intention, **une seule**
est exécutée (la plus complète) ; les autres restent approuvées-absorbées, et cela
est consigné via `dao_rate` (commentaire « absorbé par #N »).

## 5. Boucle d'amélioration continue

Les cycles récurrents passent par la série `pulse-quality`
(`swarm-dao improve status --series-id pulse-quality`) — ancres :
`pnpm test`, `pnpm build`, `pnpm lint`, `pnpm typecheck` (`.dao/improvement.json`).
Un cycle réussi par fenêtre de cooldown (24 h) ; les findings d'un cycle
nourrissent les propositions du suivant.
