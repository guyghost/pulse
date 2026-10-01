# Vague corrective finale — MissionPulse

Base examinée : `3b372a455e336cc2961a9a151d00dd61467c753d`. Correction des six constats de `final-review.md`, conformément à `final-fix-brief.md`. Aucun nouveau périmètre fonctionnel, sous-agent, push, serveur ou installation. Documents et configuration du contrôleur préservés.

## Corrections et preuves

### I1 — Passage du temps dans Suivi

`ApplicationsPage.svelte` utilise l’horloge partagée `clock.svelte.ts` pour les relances, le compteur de pipeline, la recommandation et les activités aujourd’hui/semaine. L’horloge possède une méthode de reprise immédiate ; `App.svelte` transmet l’état actif au composant déjà monté. Le tick partagé reste de 30 secondes. Le core reçoit toujours un temps explicite et ne prend aucune décision de statut automatiquement.

Régression navigateur : à 12:00, une mission détectée reçoit une relance 12:01 ; avancer les timers de 90 secondes affiche À relancer (1), sans rechargement. Le scénario poursuit la navigation vers le feed puis revient dans Suivi. Aucune entrée d’envoi n’apparaît dans l’historique. L’horloge simulée est installée avant le rechargement qui crée les intervalles, condition nécessaire pour réellement contrôler le timer partagé.

### I2 — Deux sources rafraîchies ensemble

Le nouvel orchestrateur `applications-data.svelte.ts` charge les missions et un candidat de store de suivi en parallèle puis publie la paire seulement si les deux lectures réussissent et si leur numéro de requête est encore actuel. Un échec garde la paire précédente. Les lectures antérieures et celles terminées après destruction sont ignorées. Une modification locale invalide les lectures en cours et diffère les rafraîchissements concurrents jusqu’à sa fin.

La page relit à chaque activation et aux messages `MISSIONS_UPDATED`, `SCAN_COMPLETE`, `TRACKING_UPDATED`, `TRACKING_RESTORED`. Le dossier sélectionné est conservé tant que sa mission existe. Un indicateur de saisie protège la relance non enregistrée ; changer volontairement de dossier ou enregistrer la relance le réinitialise. Les erreurs avec données en cache montrent une alerte et un bouton Réessayer sans enlever le dossier. Les contenus générés possèdent également une garde de requête/mission pour éviter une réponse associée à un ancien dossier.

Régressions unitaires : dernière paire gagnante, échec de chacune des deux lectures conservant la paire utile, différé pendant mutation, destruction, erreur visible et conservation de saisie. Régression navigateur : première visite de Suivi, modification d’une mission connue depuis le feed, arrivée d’une nouvelle mission et vraie action Ouvrir pour postuler, retour dans Suivi avec les deux suivis sélectionnés, nouvelle mission visible et saisie précédente intacte. La fixture publie le catalogue par l’événement de développement existant `dev:missions`, puis le message de mise à jour ; elle ne prétend pas exécuter un connecteur réel.

### I3 — Invalidation TJM après persistance

Le worker émet le nouveau message typé `TJM_DATA_UPDATED` après réussite de `recordTJMFromMissions`. `SCAN_COMPLETE` reste publié avant les effets non critiques ; un échec de stockage TJM ne produit ni invalidation de réussite ni terminal révisé. Le bridge et le schéma reconnaissent ce contrat. Le stub le reproduit après sa projection de scan et après une écriture d’historique, puis relaie les broadcasts de test via son runtime existant.

Le state TJM écoute cette invalidation dédiée. Toute réactivation relit le profil et l’analyse, y compris avec les filtres par défaut. Les gardes de séquence existantes protègent les réponses d’analyse et de profil.

Régressions : worker avec persistance tenue en attente (terminal déjà publié, invalidation absente jusqu’à résolution), échec non critique (un seul terminal réussi), validation du schéma, réactivation par défaut, deux invalidations rapprochées dont l’ancienne réponse arrive en dernier. Le navigateur vérifie 1 annonce tarifée après terminal, puis 2 annonces / 1 avec TJM / 1 sans TJM après persistance séparée d’une observation source absente du feed. La réactivation sans filtre relit aussi une modification ultérieure du catalogue.

### M1 — Titre de bannière lisible

La grille inline d’`OperationalStoryCard.svelte` réserve une ligne au titre, retire sa troncature et place l’action sous le texte. Le contexte accessible demeure identique. Les tests à 320 et 400 px mesurent un titre sans dépassement de sa boîte et une action située dessous ; captures produites par Playwright.

### M2 — Explication cloud sur la largeur utile

Dans `SettingsPage.svelte`, le paragraphe approuvé est déplacé après la ligne icône/titre/interrupteur, comme enfant direct de la carte. Son texte, le switch, l’état effectif et les conditions de blocage sont inchangés. À 320 et 400 px, le paragraphe utilise toute la largeur intérieure de la carte (bordure et padding déduits) et commence sous l’interrupteur. Captures produites par Playwright ; les vues feed et cloud à 320 px ont aussi été inspectées visuellement.

### M3 — Contrôles déterministes

- Les contraintes structurelles TJM vérifient l’échantillon local et son contexte, disponibles hors ligne ; celles de Suivi vérifient les relances prioritaires et l’exclusion des terminaux. L’ancienne grille tronquée n’est plus une contrainte obligatoire.
- Les scénarios daily utilisent deux missions identifiées, un score fixé, un état initial vide ou explicitement sélectionné, puis vérifient le contenu du store avant d’agir. Ils ciblent le nom accessible canonique du bouton d’envoi, comptent exactement une transition `applied`, et conservent refus d’ouverture, doubles clics, échec de confirmation et récupération effective. La suppression d’une recherche utilise focus puis Entrée, dans le scénario clavier, afin qu’un toast transitoire ne masque pas le clic.
- Le pipeline et le scan partiel interceptent le runtime existant après bootstrap ; aucun remplacement de `window.chrome`. Les fixtures sont vérifiées avant les actions. La mission partielle reste absente pendant la collecte et devient interactive seulement au terminal.
- Le filtre ARIA cible Télétravail et conserve l’assertion `aria-pressed`.

## Commandes et résultats

Toutes les commandes pnpm utilisent `PATH=/workspace/pulse-toolchain/node_modules/.bin:$PATH`. Les commandes ci-dessous sont exécutées depuis `apps/extension`, sauf indication contraire. Deux workers maximum ; aucune vérification lourde superposée.

```sh
pnpm exec vitest run --maxWorkers=2 tests/unit/state/applications-data.test.ts tests/unit/ui/ApplicationsPage.test.ts tests/unit/ui/TJMPage.test.ts tests/unit/ui/operational-ui-constraints.test.ts tests/unit/background/index.test.ts
```

159 réussites (2 orchestration, 17 Suivi à ce stade, 10 TJM, 47 contraintes UI, 83 worker). Log `/tmp/final-fix-unit.log`.

```sh
pnpm exec vitest run --maxWorkers=2 tests/unit/ui/ApplicationsPage.test.ts tests/unit/ui/clock.test.ts tests/unit/messaging/schemas.test.ts
```

122 réussites après ajout du cas d’erreur avec saisie conservée : 18 Suivi, 1 horloge, 103 schémas. Log `/tmp/final-fix-extra-unit.log`. Total dédupliqué sur les sept fichiers : **264 tests réussis**.

```sh
pnpm exec playwright test --config=playwright.ux-check.config.ts tests/e2e/feed.test.ts tests/e2e/feed-daily-commands.test.ts tests/e2e/applications-pipeline.test.ts tests/e2e/lifecycle-refresh.test.ts --workers=2
```

**22 réussites en 47,6 secondes**, comprenant les 14 tests du fichier feed dont le helper partagé a été corrigé. Log `/tmp/final-fix-e2e-final.log`. Chromium système ; captures et contextes sous `/workspace/artifacts/missionpulse-ux-implementation-2026-10-01/e2e-results/`.

Format des fichiers changés et des trois nouveaux fichiers avec `pnpm exec prettier --write`; lint ciblé avec `pnpm exec eslint --fix --no-warn-ignored` sur cette même liste ; succès. Un second lint sans `--fix` a également terminé sans erreur (`/tmp/final-fix-lint-final.log`). `pnpm typecheck` : succès (`tsc --noEmit`). `git diff --check` : succès. Logs `/tmp/final-fix-format.log`, `/tmp/final-fix-lint.log`, `/tmp/final-fix-typecheck.log`. `App.svelte` reste exclu par la configuration ESLint existante à cause de `svelte:boundary` ; sa compilation et son montage sont exercés par les E2E.

Le premier smoke Svelte compilait déjà Suivi/TJM ; deux anciennes assertions de lecture séquentielle ont été adaptées à la paire parallèle. Les premières itérations ont aussi révélé l’ancienne assertion de grille tronquée, la traduction canonique de l’erreur du store, des erreurs de locator/accordéon/mesure dans les nouveaux tests et une horloge installée trop tard pour intercepter les intervalles. Ces échecs intermédiaires ont été corrigés ; ils ne sont pas comptés comme validations. Le catalogue de développement doit être publié par son événement pour rejoindre le feed actif : l’ajout de cette étape a rendu déterministe la conservation de saisie avec le nouveau dossier.

## Auto-relecture et limites

Diff relu sur les six constats : ordre terminal/persistance conservé, invalidation seulement après succès, publication atomique des lectures, séquences et destruction, protections des mutations, sélection valide conservée, saisie non écrasée, absence de statut envoyé implicite, texte cloud inchangé, flags inchangés. Aucun accès Chrome ajouté à l’UI. Les données et migrations existantes sont conservées. Aucun compte réel, clé, backend, cloud, Copilot ou connecteur exclu activé.

Le tick peut refléter une échéance avec au plus 30 secondes de retard quand le panneau fonctionne normalement ; l’activation force une reprise immédiate. Les tests navigateur emploient le bridge et stockage de développement, et le worker est couvert séparément avec effets différés : ils ne mesurent pas la latence MV3 réelle. Aucune suite globale ni nouveau build, conformément au brief ; le contrôleur garde ces validations et la relecture indépendante.

## Livraison

Commit ciblé local, sans push. Aucun fichier du contrôleur ajouté. Le hook a exécuté ESLint et les deux passes Prettier avec succès, puis a échoué au restaging Git (`/tmp/final-fix-commit.log`). `git diff --exit-code` a confirmé l’absence de modifications non indexées et `git diff --cached --check` a réussi. Après ajout de cette note, le commit est repris avec `SKIP_SIMPLE_GIT_HOOKS=1`, conformément au brief. La sauvegarde automatique `7c7c7d192327ce9c59c9af8a9b5d5b860652b191` est préservée ; aucune restauration ou suppression de stash.

## Complément I2 — Échec réel de lecture du catalogue

La relecture ciblée a identifié un trou dans la preuve précédente : le handler réel `GET_FEED_MISSIONS` répondait `FEED_MISSIONS_RESULT` avec `[]` à une erreur IndexedDB. Le rejet simulé de la façade ne couvrait donc pas ce protocole ; la paire vide pouvait être publiée comme un succès. Lecture seule pendant la suite globale du contrôleur, puis modifications après son feu vert explicite, une fois sa suite terminée.

Correction bornée à ce contrat : le worker renvoie désormais `FEED_MISSIONS_FAILED` avec le code `READ_FAILED` et un message français stable. Aucun détail interne de stockage n’est exposé. Le type bridge et le schéma valident cette réponse. La façade valide l’échec explicite et le rejette ; elle rejette aussi une réponse inattendue ou un échec mal formé, au lieu de les transformer en catalogue vide. Une réponse réussie `FEED_MISSIONS_RESULT` avec `[]` demeure un succès valide. Le mécanisme atomique de Suivi reçoit ainsi effectivement l’erreur du worker et conserve sa dernière paire utile. Aucun autre protocole, écran ou comportement métier modifié.

Preuves supplémentaires :

- Le test du handler installé dans le vrai module background simule le rejet de la lecture DB, vérifie la réponse d’échec exacte, puis une lecture vide réussie distincte.
- La façade est testée avec échec explicite, réponse mal formée, type inattendu et succès vide. Les tests de schéma acceptent le contrat attendu et rejettent les formes incorrectes.
- Le test Svelte supplémentaire utilise la **vraie façade** via `vi.importActual`, reliée au bridge simulant le protocole du worker. Après une première paire valide et une saisie non enregistrée, le catalogue échoue tandis que la lecture du suivi renvoie un statut plus récent. Le dossier demeure affiché avec son ancien statut, le champ reste connecté au DOM avec sa saisie, et l’alerte propose Réessayer. Le clic sur Réessayer publie ensuite la paire récente sans effacer la saisie. Une lecture vide réussie ultérieure affiche l’état vide normal sans alerte. Cela prouve à la fois la conservation de la paire et la distinction échec/vide.

Commandes supplémentaires depuis `apps/extension`, avec le même PATH Node/pnpm :

```sh
pnpm exec vitest run --maxWorkers=2 tests/unit/background/index.test.ts tests/unit/facades/feed-data-facade.test.ts tests/unit/messaging/schemas.test.ts tests/unit/ui/ApplicationsPage.test.ts
pnpm exec vitest run --maxWorkers=2 tests/unit/ui/ApplicationsPage.test.ts
```

Le premier passage donne 219 réussites et un échec du nouveau harness UI : son conteneur n’était pas ajouté au document, donc `isConnected` était faux indépendamment du produit. Après rattachement du conteneur au DOM, les 19 tests UI passent. Résultat dédupliqué : **220 tests ciblés réussis** (84 worker, 13 façade, 104 schémas, 19 UI). Logs `/tmp/final-fix-i2-unit.log` et `/tmp/final-fix-i2-ui.log`. Aucun autre test global ni E2E relancé pour ce complément.

Format et ESLint ciblés sur les huit fichiers source/test changés : succès (`/tmp/final-fix-i2-format.log`, `/tmp/final-fix-i2-lint.log`). `pnpm typecheck` : succès (`/tmp/final-fix-i2-typecheck.log`). `git diff --check` : succès. Auto-relecture du handler, de la réponse publique, de la façade, des quatre cas de test et des consommateurs connexes ; l’export CV possède déjà son repli explicite en cas de lecture indisponible. Les cinq autres constats restent inchangés. Le hook complémentaire a réussi ESLint et Prettier, puis reproduit l’échec de restaging (`/tmp/final-fix-i2-commit.log`). Aucun changement hors index (`git diff --exit-code`) et index valide (`git diff --cached --check`) ; reprise autorisée avec `SKIP_SIMPLE_GIT_HOOKS=1`. Sauvegarde `a4a3126c488017c381e5d2e539e6d07f2cb60934` conservée, sans restauration ni suppression.
