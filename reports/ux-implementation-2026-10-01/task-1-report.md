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
