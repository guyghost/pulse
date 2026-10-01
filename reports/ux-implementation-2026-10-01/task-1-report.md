# Lot 1 — Feed fiable et commandes quotidiennes

Date : 1er octobre 2026. Branche : `work`. Référence initiale : `ea8c7b6220725645d84262bfedad24469cf6fc0b`.

## Livraison

Le feed applique désormais de vrais minima de note et distingue explicitement les recherches historiques utilisant un groupe exact. L’ouverture pour postuler ne déclare jamais une candidature envoyée. La confirmation est une action explicite, disponible dans les détails de carte et dans l’investigation. Les commandes quotidiennes et la comparaison occupent une hauteur réservée du layout.

Les retours de pertinence sont locaux, modifiables et effaçables. Le tri personnalisé utilise ces retours sans modifier la note canonique. Les cartes repliées conservent leur légèreté : les retours et la confirmation vivent dans les détails ; le bandeau de points forts présente au plus deux raisons.

## Couverture du brief

| Exigence                              | Mise en œuvre et validation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. A ≥ 80, B ≥ 60, C ≥ 40             | `matchesMinimumScore` est une fonction pure utilisant la note canonique. Les bornes exactes et les scores supérieurs sont testés. Les distributions statistiques restent des groupes exacts. Les schémas de recherches acceptent `scoreFilterMode` et les lectures historiques prennent la valeur `exact` : aucune ancienne recherche n’est effacée ni transformée silencieusement. L’application d’une recherche historique l’explique ; choisir une note minimale remplace explicitement ce mode. Un autre changement de filtre conserve le mode historique. Le TJM minimum est également enregistré/restauré.                                                              |
| 2. Ouverture et candidature explicite | Le core définit un chemin valide selon l’intention ; une façade shell attend l’ouverture de source puis sélectionne les missions non suivies/détectées, sans régression des missions sélectionnées/préparées ou ultérieures. « J’ai envoyé ma candidature » parcourt sélection → préparation → envoi depuis les états précoces. La carte et le drawer réutilisent le même contrôleur. Le bouton générique vers `applied` porte lui aussi ce libellé explicite et utilise le contrôleur. Verrou par mission, boutons désactivés en attente, annulation conservée et erreurs visibles. Tests des quatre états de départ, des états ultérieurs, des échecs et des clics répétés. |
| 3. Modal et clavier                   | La feuille de filtres utilise `modal-focus.ts` avec une surface/variante dédiée. Le registre déplace la couche dans son overlay commun, neutralise le fond, confine Tab/Shift+Tab, traite Échap et restitue le focus. Le gestionnaire des raccourcis ignore tout dialogue modal actif. Les E2E parcourent 30 tabulations, vérifient la restitution du focus et l’absence de changement Favoris par le raccourci `f` derrière le dialogue.                                                                                                                                                                                                                                     |
| 4. Recherche, filtres et comparaison  | Un conteneur flex réserve la hauteur du dock et de la barre de comparaison. Le feed dispose d’un seul conteneur de défilement, `min-h-0 flex-1 overflow-y-auto`. Les composants de liste et leur chargement progressif restent en place. Les E2E vérifient les coordonnées du dock et du conteneur à 320/400 px avec carte développée et deux missions comparées.                                                                                                                                                                                                                                                                                                             |
| 5. Favoris, tri, recherches nommées   | Favoris et tri Note/Date/TJM/Personnalisé sont exposés dans les filtres. Formulaire nommé, application et suppression de recherches utilisent la persistance existante. Nom vide refusé, limite de 12 explicite, pas de suppression de la recherche la plus ancienne pour faire de la place. La réservation des suppressions en attente protège la limite et l’annulation. Identifiants uniques, persistance avant confirmation en mémoire, restauration ciblée en cas d’échec de suppression, erreurs en français.                                                                                                                                                           |
| 6. Libellés et densité                | « Actualiser » visible dans les commandes, modes Télétravail/Hybride/Présentiel sur les cartes et dans les filtres. Presets rapides utilisables dans une grille à 320 px. Deux raisons maximum dans le bandeau compact. Les descriptions, critères détaillés et explications de notes restent consultables.                                                                                                                                                                                                                                                                                                                                                                   |
| 7. Feedback local                     | `MissionFeedbackMap` validé et persisté dans `chrome.storage.local` par le shell, exposé via façade ; aucun appel Chrome ajouté à l’UI. Écritures sérialisées afin de conserver les retours de deux missions. « Pertinent », « Hors cible », modification, second clic pour effacer et bouton explicite d’effacement. Le tri pur priorise pertinent, place neutre au milieu, abaisse hors cible et départage par note canonique. Une explication visible précise que la note reste inchangée. Tests du classement, de la conservation des notes/tableaux, de la persistance, des modifications et des erreurs. Le stub dev conserve aussi ces retours après rechargement.     |

## Vérifications effectuées

Toutes les commandes pnpm ont utilisé `PATH=/workspace/pulse-toolchain/node_modules/.bin:$PATH` depuis `apps/extension`. Les dépendances n’ont pas été réinstallées.

### Unitaires et contrats

Commande finale :

```sh
pnpm exec vitest run \
  tests/unit/state/feed-page.test.ts \
  tests/unit/core/feed-local-feedback.test.ts \
  tests/unit/tracking/application-intent.test.ts \
  tests/unit/storage/mission-feedback.test.ts \
  tests/unit/ui/MissionCard.test.ts \
  tests/unit/ui/MissionInvestigationDrawer.test.ts \
  tests/unit/storage/chrome-storage.test.ts \
  tests/unit/ui/modal-focus-policy.test.ts \
  tests/unit/models/feed-filter-sheet.model.test.ts \
  tests/unit/scoring/sort-missions.test.ts \
  tests/unit/scoring/rank-missions.test.ts \
  tests/unit/messaging/schemas.test.ts \
  tests/unit/facades/feed-data-facade.test.ts \
  tests/unit/ui/modal-focus-registry.test.ts \
  tests/unit/ui/operational-ui-constraints.test.ts
```

Résultat : **15 fichiers, 374 tests réussis**. Les avertissements de validation de settings dans stderr sont attendus par les cas négatifs existants.

Les attentes de copy historiques ont été adaptées au nouveau libellé d’ouverture et à la limitation à deux raisons. Le test structurel du conteneur de feed a été adapté au layout flex ; la portée réelle du défilement est vérifiée par E2E.

### E2E

La configuration temporaire `playwright.task1.config.ts` a importé la configuration existante avec `executablePath: '/usr/bin/chromium'`, `args: ['--no-sandbox']`, deux workers et réutilisation du serveur déjà lancé sur 5176. Elle est supprimée avant commit.

```sh
pnpm exec playwright test --config=playwright.task1.config.ts \
  tests/e2e/feed-daily-commands.test.ts \
  tests/e2e/feed-tracking-failures.test.ts
```

Résultat : **5 scénarios réussis** : commandes et candidature à 320/400 px, suivi indisponible/retry, rejet de transition, rejet d’annulation. Les deux parcours largeur incluent comparaison et vérification de l’espace réservé du dock.

Un sixième scénario supplémentaire a vérifié ouverture refusée + deux clics synchrones (une ouverture, zéro transition), puis confirmation refusée (pas de badge Envoyée, action récupérable). Vérification finale ciblée :

```sh
pnpm exec playwright test --config=playwright.task1.config.ts \
  tests/e2e/feed-daily-commands.test.ts -g 'failed opening'
```

La fixture historique de suivi a été corrigée pour précharger son catalogue dans le bootstrap dev et attacher son mock au runtime disponible. L’ancien remplacement du global `chrome` ne déclenchait pas l’interception avec le Chromium système ; les erreurs mockées n’étaient donc pas exercées. L’intervalle d’attente de la fixture est nettoyé dès l’attachement.

### Contrôles statiques et build

- `pnpm typecheck` : réussi (`tsc --noEmit`).
- `pnpm exec eslint <fichiers TS/Svelte du lot>` : réussi, zéro erreur et zéro avertissement au contrôle final. Le contrôle complémentaire de FeedPage/FeedFilterSheet et du dernier E2E est également réussi.
- `pnpm exec prettier --write <fichiers du lot>` : appliqué.
- `pnpm build` : réussi, 594 modules transformés ; compilation Svelte et bundle MV3 produits. Aucune dépendance ou modification de manifest.
- `git diff --check` : réussi.

## Auto-relecture et corrections

L’auto-relecture a vérifié les limites Functional Core / Imperative Shell, les imports, les schémas de messages et les anciens formats de recherches. Elle a corrigé le tri personnalisé dans le focus de notification pour garder sa portée, la sérialisation des writes de feedback, les collisions possibles d’identifiants de recherches et la restitution ciblée des recherches supprimées.

Une erreur de structure Svelte introduite pendant le premier montage flex a été détectée en navigateur et corrigée : le script d’instance et le script module restent tous deux à la racine. Les noms de props des boutons d’attente ont également été corrigés. Le build et les E2E passent après ces corrections. Les retours visuels du contrôleur ont conduit à déplacer les nouvelles commandes de feedback et de confirmation dans les cartes développées.

## Limites et questions

- Aucune question bloquante. Les choix UI restent réversibles.
- Une confirmation couvre plusieurs transitions valides persistées successivement. Si une étape intermédiaire échoue, le suivi conserve la dernière étape effectivement confirmée et une erreur est affichée ; il ne déclare pas l’envoi. Une nouvelle confirmation reprend depuis cette étape. La façade utilise le protocole existant, sans nouvelle transaction backend.
- La suppression d’une recherche conserve la fenêtre d’annulation existante de cinq secondes ; l’échec de persistance restaure la recherche et affiche une erreur.
- Les E2E utilisent les stubs existants, aucun compte réel ni candidature réelle. Le build est compilé ; aucun essai dans une extension MV3 chargée n’a été ajouté à ce lot.
- La suite globale et les autres lots restent à la charge du contrôleur. Aucun service connecté, Copilot cloud, backend, clé, connecteur exclu ou déploiement n’a été activé.
- Le diff de FeedPage est volumineux surtout parce que le wrapper flex entraîne une réindentation du markup par Prettier.

Commit local ciblé uniquement ; aucun push. Le document de plan préexistant reste hors commit.

Le hook de commit a exécuté ESLint et Prettier avec succès, puis `lint-staged` a échoué à restager les fichiers (erreur Git, index et fichiers intacts). Le commit a été repris avec ces contrôles déjà effectués et sans réexécuter ce hook. Le rapport, ignoré par la règle existante `reports/`, a été ajouté explicitement.

## Correction 1 — Suite à la relecture indépendante

Base : `6a317dd8caa4f6530e881a472a572cc11a31075e`. Les deux findings Important ci-dessous sont repris verbatim comme exigences correctives. Cette section précise la correction des parcours de persistance qui restaient défectueux à la première livraison.

> ### Important — Enregistrer une recherche finalise prématurément une suppression annulable
>
> Référence : [feed-page.svelte.ts:1305](/workspace/pulse/apps/extension/src/lib/state/feed-page.svelte.ts:1305), avec la restauration à [feed-page.svelte.ts:436](/workspace/pulse/apps/extension/src/lib/state/feed-page.svelte.ts:436).
>
> Avec une recherche A existante et une capacité disponible, supprimer A puis enregistrer B avant l'expiration des cinq secondes écrit immédiatement `[B, …]` : `nextViews` ne contient pas les recherches temporairement retirées de `savedViews`. Cliquer ensuite sur « Annuler » restaure A uniquement en mémoire. A semble récupérée mais disparaît au prochain chargement. Fermer le panneau pendant cette même fenêtre perd également A malgré le contrat de suppression différée. Le contrôle de quota par `pendingViewDeletes` ne protège pas le contenu écrit.
>
> Une autre interférence existe si A est supprimée pendant l'enregistrement asynchrone de B : `persistSavedViews` réaffecte son tableau capturé après l'attente (ligne 1286), réintroduisant A. Le commit de suppression écrit ensuite ce tableau sans retirer explicitement son identifiant. Une suppression peut ainsi être perdue. Les créations et les commits de suppression doivent partager une orchestration qui conserve les suppressions encore annulables et ne réaffecte pas un instantané devenu obsolète.
>
> Impact : perte d'une recherche dont la suppression a été annulée, ou suppression non exécutée. Exigences concernées : préservation des données, création/suppression persistées et annulation existante du point 5. Les tests fournis couvrent la suppression isolée, pas son interaction avec une création.
>
> ### Important — Une lecture absente ou échouée permet d'écraser les retours et les recherches existants
>
> Référence : [feed-page.svelte.ts:1973](/workspace/pulse/apps/extension/src/lib/state/feed-page.svelte.ts:1973), avec le traitement de lecture à [feed-page.svelte.ts:1513](/workspace/pulse/apps/extension/src/lib/state/feed-page.svelte.ts:1513).
>
> Si `getMissionFeedback()` échoue alors que des retours existent en stockage, seul un toast est affiché ; `feedback` conserve sa valeur initiale `{}` et les commandes restent actives. Un clic ultérieur sur « Pertinent » ou « Hors cible », dès que l'écriture réussit, construit une map à partir de cet objet vide puis remplace intégralement `missionLocalFeedback` via `saveMissionFeedback`. Tous les retours des autres missions sont effacés. La file d'écritures protège les écritures entre elles, mais pas la réussite du chargement initial. Le même risque existe si une écriture précède la fin du chargement.
>
> Le même défaut affecte les recherches exposées par ce lot : [feed-page.svelte.ts:1525](/workspace/pulse/apps/extension/src/lib/state/feed-page.svelte.ts:1525) ignore un rejet de `getFeedSavedViews`, laisse le tableau initial vide et n'empêche pas `saveCurrentView` de persister `[nouvelleRecherche]` (ligne 1305). Une création après un échec du bridge efface donc toutes les recherches précédentes. De plus, l'adaptateur existant [chrome-storage.ts:211](/workspace/pulse/apps/extension/src/lib/shell/storage/chrome-storage.ts:211) transforme une erreur de lecture du stockage en tableau vide ; dans ce cas, même un simple indicateur de résolution du chargement UI ne distinguerait pas une lecture réussie d'une lecture échouée. Le chemin d'erreur de lecture doit conserver cette distinction. Il s'agit du parcours de création/persistance du point 5, pas d'une demande d'audit supplémentaire.
>
> Impact : perte silencieuse des choix locaux ou des recherches précédents après une erreur de lecture ou une lecture retardée. Exigences concernées : données existantes préservées, persistance et gestion des erreurs des points 5 et 7. Attendre une lecture réussie ou empêcher une écriture de remplacement tant que l'état initial n'est pas connu corrigerait ces parcours.

### Changements correctifs

- Le catalogue des recherches conserve les entrées temporairement supprimées jusqu’au commit de leur propre fenêtre d’annulation. Une projection séparée masque uniquement les suppressions en attente dans l’UI. Les créations et commits de suppression partagent une file d’écritures ; une création persiste le catalogue complet, puis recalcule la projection selon les suppressions actuelles. Un commit retire explicitement son identifiant, et son échec restitue la projection depuis le catalogue confirmé. Aucune réaffectation d’un ancien tableau visible après une attente. La limite reste appliquée à toutes les recherches encore conservées.
- Les deux chargements initiaux ont une promesse partagée et un indicateur de réussite fondé sur une lecture valide. Une mutation attend cette lecture ; un rejet n’autorise aucune écriture de remplacement. Une tentative suivante relance la lecture et préserve les données existantes si elle réussit. Une réponse tardive ne peut pas écraser une mutation, car cette mutation n’a pas commencé avant la fin de la lecture.
- `getFeedSavedViews` dans chrome-storage propage les erreurs de lecture et de validation. Seule une clé absente après lecture réussie produit un tableau vide. Le worker renvoie un message explicite `FEED_SAVED_VIEWS_FAILED` en cas de rejet ; la façade rejette ce message et les autres réponses inattendues. Le feedback applique la même distinction entre clé absente, données valides et erreur de lecture/validation.
- Correction Minor : le bouton supplémentaire de confirmation n’est rendu que si les transitions ne présentent pas déjà `applied`. La carte développée présente une seule commande « J’ai envoyé ma candidature » pour les états sélectionné et préparé.

### Tests et contrôles

Horloge shell simulée avec les fake timers Vitest ; lectures et écritures shell contrôlées par promesses explicites. Les fixtures vérifient séparément le stockage et la projection UI. Scénarios ajoutés : suppression A → création B → annulation → rechargement, fermeture pendant cette fenêtre, suppression pendant une création retardée, expirations décalées de deux suppressions pendant une création, lectures échouées puis réessayées des deux collections, lectures retardées avant mutation, erreur et validation du stockage, transport/contrat d’erreur du bridge, confirmation unique des cartes sélectionnées et préparées.

Depuis `apps/extension`, avec `PATH=/workspace/pulse-toolchain/node_modules/.bin:$PATH` :

```sh
pnpm exec vitest run \
  tests/unit/state/feed-page.test.ts \
  tests/unit/storage/chrome-storage.test.ts \
  tests/unit/storage/mission-feedback.test.ts \
  tests/unit/ui/MissionCard.test.ts \
  tests/unit/facades/feed-data-facade.test.ts
```

Première passe : 126/127 réussis ; le test d’écriture retardée devait attendre son signal d’entrée explicite plutôt qu’un nombre supposé de microtâches. Après correction de cette synchronisation, relance du seul fichier `tests/unit/state/feed-page.test.ts` : **35/35 réussis**. Les quatre autres fichiers restent réussis : **18 + 4 + 58 + 12 tests**.

```sh
pnpm exec vitest run tests/unit/messaging/schemas.test.ts
pnpm typecheck
pnpm exec eslint --fix <les 14 fichiers TS/Svelte affectés>
pnpm exec prettier --write <les fichiers affectés>
git diff --check
```

Résultats : **102/102 tests de messages réussis ; 229 tests concernés réussis au total**, typecheck réussi, lint réussi sans erreur ni avertissement, format appliqué, contrôle de diff réussi. Les avertissements des cas négatifs settings restent attendus. Aucune suite non affectée réexécutée. Aucun nouveau E2E : la seule modification UI est la suppression du bouton redondant, couverte par le test de composant paramétré sur les deux états.

Auto-relecture : vérification des deux files, du catalogue conservé pendant les suppressions, du retrait explicite lors de commit, des erreurs propagées de chrome-storage jusqu’à la façade, du succès de lecture requis avant remplacement et de la conservation des autres données lors du retry. Aucun nouveau service ni fonctionnalité ajouté, aucun sous-agent, aucun push. Aucune question bloquante.

Le hook a de nouveau exécuté ESLint/Prettier avec succès puis échoué au restaging Git du rapport ignoré. Comme au premier commit, l’index intact est vérifié et le commit est repris sans réexécuter ce hook.
