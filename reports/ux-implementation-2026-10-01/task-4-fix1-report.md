# Lot 4 — Correctif de population source, passe 1

Base : `a561a6f65b466d1f54052889fa605d3900f18f2b`.
Statut : **DONE**, prêt pour relecture ciblée du constat Important de `task-4-review.md`.

## Défaut et correction

La revue a démontré que le feed élimine heuristiquement certaines publications de
sources/URL distinctes avant leur transmission à l’historique TJM. Enregistrer seulement
les gagnantes faisait dépendre le dénominateur, les tarifs absents et la composition du
regroupement des scans. Le calcul TJM lui-même ne pouvait récupérer les annonces perdues.

`persistPostCommitEffects` transmet désormais `result.sourceMissions` à la persistance
pour les observations identifiables. `recordTJMFromMissions` distingue explicitement
cette population des `result.missions` utilisées par les agrégats legacy. La fonction
conserve une valeur par défaut compatible pour les appels qui fournissent déjà une
population complète. Le chemin de production passe toujours les deux populations.

Les annonces source gardent leur propre `scrapedAt`, catégorie, expérience, région,
mode et tarif absent. Les gagnantes restent utilisées pour le feed et les agrégats
historiques ; la déduplication source + URL demeure dans le core TJM. L’effet intervient
toujours après commit et son éventuel échec reste non bloquant pour le scan.

Le modèle documente la limite du bootstrap : il lit les publications effectivement
stockées. Une annonce éliminée avant sa persistance dans l’ancien fonctionnement ne
peut pas être reconstruite depuis une gagnante ou une moyenne. Aucun backfill fictif,
aucune date/dimension inventée, aucun appel cloud ni changement du feed.

## Preuve de régression et vérifications

Commandes avec `PATH=/workspace/pulse-toolchain/node_modules/.bin:$PATH`.

1. Deux tests ajoutés puis exécutés **avant** la correction :
   `pnpm --filter @pulse/extension test tests/unit/tjm-history/storage.test.ts tests/unit/background/index.test.ts -t 'retains the same source population|projects all source announcements'`.
   Les deux échouent : le post-commit ne fournit pas la population source et le scan
   commun donne une seule annonce, zéro sans TJM et seulement LeHibou. Log :
   `/tmp/tjm-fix1-regression-before.log`.
2. Après correction :
   `pnpm --filter @pulse/extension test tests/unit/tjm-history tests/unit/background/index.test.ts`.
   **211 tests réussis dans 9 fichiers**. Log : `/tmp/tjm-fix1-tests.log`.
3. `pnpm --filter @pulse/extension typecheck` : réussi.
   Log : `/tmp/tjm-fix1-typecheck.log`.
4. ESLint ciblé sur `src/background/index.ts`, `src/lib/shell/storage/tjm-history.ts`,
   `tests/unit/tjm-history/storage.test.ts` et `tests/unit/background/index.test.ts` :
   réussi. Log : `/tmp/tjm-fix1-lint.log`.
5. Prettier sur les fichiers modifiés et `git diff --check` : réussis.

Le test d’intégration utilise les vraies fonctions de déduplication du feed, de
persistance/relecture et d’analyse TJM, avec le seul stockage Chrome simulé en mémoire.
Les deux annonces ont des sources et URL distinctes, mais la même signature suffisante
pour que le feed en garde une seule. L’annonce Free-Work n’a pas de TJM, catégorie ni
expérience. Le test compare la collecte commune à deux collectes distinctes :

| Après correction | Annonces | Avec TJM | Sans TJM | Composition | Médiane |
| --- | ---: | ---: | ---: | --- | ---: |
| Scan commun | 2 | 1 | 1 | LeHibou 1, Free-Work 1 | 600 |
| Deux scans | 2 | 1 | 1 | LeHibou 1, Free-Work 1 | 600 |

Il vérifie aussi l’égalité de l’analyse entière, les deux observations conservées à leur
vraie date, les dimensions inconnues de Free-Work et l’absence de double comptage dans
les agrégats legacy. Le test worker vérifie que le chemin réel post-commit reçoit les
deux sources pour le TJM tout en ne stockant que la gagnante dans le feed.

La suite monorepo du contrôleur était terminée avant toute édition. Aucune suite
générale, aucun E2E ni changement UI supplémentaire n’a été entrepris pour ce correctif
purement lié à la population de persistance. Les constats UI/largeur de la passe globale
restent au contrôleur. Auto-relecture limitée aux deux populations, au passage effectif
par le worker, aux dates et à la compatibilité legacy : conforme au constat corrigé.

## Commit et périmètre

Six fichiers ciblés : worker, stockage TJM, modèle, deux tests et ce rapport. Aucune
édition de scanner/déduplication, aucun connecteur/flag activé, aucun sous-agent,
aucun push. Le commit standard est tenté avec les hooks ; tout incident est ajouté
ci-dessous avant la reprise prévue par le protocole du contrôleur.

Le hook standard a reproduit l’incident connu : ESLint et Prettier réussissent, puis
`lint-staged` échoue à « Staging changes from tasks » avec une erreur Git. Log :
`/tmp/tjm-fix1-commit.log`. Sauvegarde annoncée :
`455e72550fb31404c379a7a58bbeff3c81e35176`, préservée avec les précédentes.
L’arbre de travail et l’index ont été comparés après l’échec : aucune différence,
six fichiers ciblés, `git diff --cached --check` réussi. Ce complément de rapport a
été formaté/réindexé et le commit repris avec `SKIP_SIMPLE_GIT_HOOKS=1` ; aucun contrôle
technique en échec n’a été contourné.
