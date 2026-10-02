# Lot 4 — TJM segmenté et contexte de l’échantillon

Statut : **DONE**. Implémentation locale depuis `3088005eb714df0e2093a56f0d3eedcc2e4f9187`, sans push ni activation de service connecté.

## Résultat livré

La page TJM intersecte période, région, catégorie métier, expérience et mode de travail,
avec les technologies du profil explicitement rappelées. Les catégories proviennent
exclusivement de `mission.classification?.category` déjà présent ; aucune classification
cloud n’est demandée. Les champs absents sont comptés comme non renseignés, proposés
comme segments explicites et exclus des segments précis. La géographie de l’observation
reste indépendante du mode de travail.

Les médianes utilisent désormais les valeurs `mission.tjm` d’annonces identifiables.
Une annonce rescannée, multi-stack ou visible sous plusieurs identifiants de compte
ne pèse qu’une fois lorsque sa source et son URL canonique correspondent. L’instantané
le plus récent de la période précède le filtrage des dimensions, pour ne pas ressusciter
une ancienne catégorie. Les tarifs nuls, invalides ou absents restent dans le dénominateur
sans contribuer à la médiane. Les médianes paires conservent leur fraction exacte,
affichée en français. Aucun groupe absent n’obtient une médiane zéro ou un repli global.

À l’ouverture, le worker lit les missions déjà stockées et leur vraie date `scrapedAt`,
puis les combine aux observations persistées. Aucun nouveau scan n’est requis et
aucune date observée n’est créée artificiellement. La collecte après commit du scan
persiste aussi les annonces sans tarif/stack ; les écritures concurrentes sont sérialisées.

`TJMHistory.records` reste disponible aux consommateurs historiques, notamment Copilot.
`addRecords` et la migration conservent les nouvelles observations. L’ancienne série
agrégée apparaît séparément dans un détail clairement hors segmentation ; elle ne
nourrit aucune médiane ou taille d’échantillon du nouvel écran.

L’interface présente médiane, annonces uniques, avec/sans TJM, contexte choisi,
fraîcheur, composition par source et champs absents. Les cartes d’expérience sans
valeur indiquent « Aucun tarif renseigné ». La limite « valeur annoncée, parfois minimum
d’une fourchette, pas prix négocié ni tout le marché » est visible près des chiffres.
Les erreurs de lecture offrent une nouvelle tentative, les réponses tardives sont
ignorées et la navigation réinitialise les filtres.

## Architecture et périmètre

- Core pur : `core/tjm-history/observations.ts`, types ajoutés dans `core/types/tjm.ts`.
- Shell : validation/migration Zod partagée, stockage, façade, bridge, handler worker et stub dev cohérents.
- État Svelte 5 : `state/tjm-page.svelte.ts` ; UI : `TJMPage` et `TJMSampleDashboard`.
- Modèle : `models/tjm-local-sample.model.md` ; les deux modèles anciens indiquent désormais leur portée historique.
- Les lots 1–3, flags de fonctionnalités, exclusions de connecteurs et configuration cloud sont conservés.
- Aucun sous-agent, aucune installation, aucun redémarrage du serveur 5176.

## Vérifications

Toutes les commandes pnpm utilisent `PATH=/workspace/pulse-toolchain/node_modules/.bin:$PATH` (Node 22 / pnpm 10).

- Smoke précoce : `pnpm --filter @pulse/extension typecheck`, `build`, montage `TJMPage` et façade. Réussis après adaptation des fixtures au nouveau contrat distinct.
- `pnpm --filter @pulse/extension test tests/unit/tjm-history tests/unit/ui/TJMPage.test.ts tests/unit/facades/tjm-facade.test.ts tests/unit/messaging/schemas.test.ts tests/unit/background/index.test.ts tests/unit/copilot/build-tjm-coach-facts.test.ts tests/unit/copilot/coordinator.test.ts` : **342 tests dans 14 fichiers**. Couverture : filtres croisés, inconnus, périodes/bornes/futur, identité/URL/scans/stacks, médianes et sans-TJM, groupes absents, migration, écritures concurrentes et reprise après échec, worker/bridge, profil, erreur/retry et réponse tardive UI, compatibilité Copilot.
- `pnpm --filter @pulse/extension exec playwright test --config=playwright.ux-check.config.ts tests/e2e/tjm.test.ts` : **7 E2E**, Chromium système, 2 workers. Lecture des missions existantes sans scan, vrai calcul, croisements/segment vide, inconnus, legacy isolé, hors-ligne et clavier/absence de débordement à 320 et 400 px.
- `pnpm --filter @pulse/extension typecheck` et `build` : réussis ; build production inchangé concernant les fonctionnalités connectées.
- ESLint ciblé sur les fichiers TypeScript/Svelte du lot et Prettier : réussis ; configuration Playwright temporaire du contrôleur exclue du périmètre.
- `git diff --check` : réussi.

Les premières exécutions ont révélé des fixtures encore au format agrégé et des noms
accessibles manquants sur les selects ; les fixtures et les noms accessibles ont été
corrigés avant la validation finale. ESLint a demandé des accolades et `SvelteDate`
pour la référence de fraîcheur. L’auto-relecture a remplacé `URL.canParse` par le
parsing compatible avec les anciens Chrome déjà supportés et ajouté le test de repli
sur l’identifiant externe pour une URL mal formée.

Le contrôleur a confirmé manuellement : contrôles lisibles et largeur 320 px,
segment Senior vide sans remplacement, puis croisement à 400 px « 7 jours + métier
non renseigné + confirmé + hybride » donnant 3 annonces et un contexte cohérent.
Preuves communiquées par le contrôleur :

- `/workspace/artifacts/missionpulse-ux-implementation-2026-10-01/tjm-controls-320.png`
- `/workspace/artifacts/missionpulse-ux-implementation-2026-10-01/tjm-empty-320.png`
- `/workspace/artifacts/missionpulse-ux-implementation-2026-10-01/tjm-controls-final-320.png`
- `/workspace/artifacts/missionpulse-ux-implementation-2026-10-01/tjm-segment-400.png`

Ses finitions ont été intégrées : nombres français, « Télétravail complet », composition
en lignes nommées explicites. Les manipulations interrompues par HMR ne sont pas comptées
comme preuves. Logs locaux : `/tmp/tjm-final-tests.log`, `/tmp/tjm-e2e-final.log`,
`/tmp/tjm-lint-final.log`, `/tmp/tjm-typecheck-final.log`, `/tmp/tjm-build-final.log`.

## Limites assumées

La déduplication identifie une annonce publiée sur une source ; deux publications sur
deux plateformes restent deux annonces faute d’identité commune démontrée. Les
observations historiques n’existent qu’à partir de vrais instantanés : les anciennes
moyennes ne permettent pas de reconstruire des annonces. La lecture initiale combine
les missions en mémoire sans réécrire l’historique. La conservation des instantanés
n’introduit pas de purge automatique ; la taille locale augmente avec la collecte.
Le métier reste souvent non renseigné lorsque la classification facultative n’a jamais
été effectuée. Ces limites sont compatibles avec la portée locale demandée.

## Commit

Commit ciblé des sources, tests, modèles et du présent rapport. La tentative standard
utilise le hook du dépôt ; tout incident de hook est consigné ci-dessous avant une
éventuelle reprise. Les fichiers de plan et la configuration Playwright appartenant au
contrôleur restent hors index, les stashes de sauvegarde sont préservés.

La tentative standard a échoué au hook `lint-staged` après réussite d’ESLint et des
deux étapes Prettier : `Failed to stage changes from tasks!` / `lint-staged failed due
to a git error`. Le log est conservé dans `/tmp/tjm-commit.log`. Le hook a annoncé la
sauvegarde `b8a85f52a1ce728e3b28ce583fcff0ab44c4f5a0` ; aucune sauvegarde n’a été supprimée
ou appliquée. Vérification après l’échec : pas de différence source entre index et
arbre de travail, `git diff --cached --check` réussi et 24 fichiers ciblés dans l’index.
Le présent complément documentaire a ensuite été formaté et réindexé ; le commit a
été repris avec `SKIP_SIMPLE_GIT_HOOKS=1`, conformément au protocole communiqué par le
contrôleur. Aucun contrôle technique en échec n’a été contourné.
