# Correctifs et évolutions UX — 1er octobre 2026

## Objectif et contraintes globales

Appliquer les recommandations de l’audit `/workspace/artifacts/missionpulse-ux-2026-10-01/rapport.md`, autorisées par l’utilisateur. Le rapport est la spécification du besoin ; ce plan précise les critères de livraison.

- Conserver Svelte 5, TypeScript strict et l’architecture Functional Core / Imperative Shell de `AGENTS.md`. Logique métier pure dans le core, I/O dans le shell, orchestration dans les modules d’état. Pas de nouvel appel Chrome direct dans l’UI.
- Interface et documentation en français, code et commentaires en anglais. Préserver les données existantes et les migrations de persistance.
- Vérifier les interfaces à 320 et 400 px, le clavier, les états vides et les erreurs. Ajouter des tests de comportements utiles, pas des tests reproduisant l’implémentation.
- Ne pas activer les services connectés, le Copilot cloud ou les connecteurs exclus du build. Pas de backend, de dépendance payante, de clé ajoutée ou de déploiement.
- Le suivi local peut être activé après correction des candidatures. Une ouverture de plateforme ne prouve jamais l’envoi d’une candidature.
- Les retours de pertinence restent locaux, réversibles et explicites ; ils ne réécrivent pas la note canonique de la mission.
- Chaque tâche : relire le périmètre, implémenter, vérifier, écrire un rapport avec commandes et résultats, commit local ciblé. Aucun sous-agent supplémentaire chez l’implémenteur. Le contrôleur organise une relecture indépendante ensuite.
- Environnement : dépôt `/workspace/pulse`, branche de travail `work`, HEAD initial `ea8c7b6220725645d84262bfedad24469cf6fc0b`. Préfixer les commandes pnpm avec `PATH=/workspace/pulse-toolchain/node_modules/.bin:$PATH` (Node 22 / pnpm 10). Dépendances installées ; Chromium système `/usr/bin/chromium` disponible. Ne pas réinstaller les dépendances.

## Task 1: Feed fiable et commandes quotidiennes

Corriger les P1 du feed et exposer ses fonctions quotidiennes. Propriété principale : `FeedPage`, `MissionCard`, `VirtualMissionFeed`, `FeedFilterSheet`, état/modèles du feed, transitions de suivi nécessaires et tests associés. La navigation globale sera traitée en tâche 2.

1. « Note minimale » applique de vrais seuils A≥80, B≥60, C≥40 et conserve donc A dans B/C. Distinguer ce minimum des groupes exacts éventuellement utilisés ailleurs ; migrer les recherches sauvegardées sans corruption. Couvrir les bornes et les notes canoniques.
2. « Ouvrir pour postuler » ouvre la source avec gestion des erreurs, permet un suivi valide depuis les missions non suivies/détectées/sélectionnées/préparées et ne passe jamais automatiquement à `applied`. Ajouter une confirmation explicite « J’ai envoyé ma candidature » qui parcourt les transitions valides depuis chacun de ces états. Préserver les étapes ultérieures et l’annulation existante. Réutiliser ce comportement dans le détail de mission. Tests de non-envoi à l’ouverture, confirmation, échec d’ouverture/transition et clics répétés.
3. Réutiliser `shell/ui/modal-focus.ts` pour confiner le focus dans les filtres, neutraliser le fond et restituer le focus après Échap/fermeture. Aucun raccourci clavier ne doit agir derrière le dialogue.
4. Placer la recherche et les filtres dans un espace réservé du layout du feed, sans recouvrir les boutons des cartes, y compris carte développée au milieu de la liste et comparaison. Conserver la virtualisation et un défilement fonctionnel.
5. Rendre Favoris, tri score/date/TJM et recherches enregistrées accessibles dans les commandes principales/filtres. Réutiliser les capacités de persistance existantes ; permettre création, application et suppression d’une recherche nommée avec retours d’erreur. Gérer les noms vides et la limite existante.
6. Afficher « Actualiser », les modes Télétravail/Hybride/Présentiel, alléger les cartes compactes (au plus deux raisons principales), presets utilisables à 320 px. Préserver les détails consultables et l’explication des notes.
7. Ajouter des retours locaux « Pertinent » / « Hors cible », modifiables/effaçables, persistés. Exposer un tri personnalisé expliquant son effet (priorise les missions marquées pertinentes, abaisse celles hors cible, note inchangée), avec logique pure et tests ; aucun apprentissage cloud ou changement silencieux du score.

Validation : tests unitaires couvrant seuils, persistance/transitions et feedback ; tests E2E critiques filtres/clavier/candidature/recherches avec mocks existants ; typecheck et lint du périmètre. Rapport à `reports/ux-implementation-2026-10-01/task-1-report.md`.

## Task 2: Entrée, navigation, profil et réglages compréhensibles

Propriété principale : `App`, onboarding (Flow/Layout/Welcome/Page), `ProfilePage`, `SettingsPage`, états/facades de réglages et santé des sources, tests associés. Réutiliser les interfaces du feed livrées en tâche 1 sans les réécrire.

1. Navigation nommée persistante, accessible à 320/400 px, `aria-label` français ; adapter les tests existants aux libellés voulus.
2. Raccourcis « Scanner maintenant » / « Continuer sans source » visibles sans défilement au bas de l’étape Sources, introduction répétée compacte, enrichissement du profil toujours disponible. Préserver validations, consentements et permissions existants.
3. Remplacer « 100% sur votre navigateur » par une explication exacte : données locales par défaut, cloud facultatif. Aligner les notifications avec le seuil réellement configuré (défaut 70) ; ne pas modifier silencieusement les préférences pour obtenir une note A.
4. Section « Intelligence artificielle », sous-sections « Dans votre navigateur » et « Service cloud facultatif ». Décrire les données transmises, besoin d’une clé et état effectif. Ne pas afficher une activation effective sans clé. Remplacer Jev/fallback/couverture dans le texte utilisateur par termes compréhensibles ; métriques sans chevauchement à petite largeur.
5. Sources : désactivée, connexion vérifiée, session à reconnecter, erreur, vérification inconnue et dernière réussite lorsque disponible. Utiliser données réelles de santé/statuts et vérification existante `verify-source-session.ts`. Boutons reconnecter/ouvrir puis revérifier, erreurs explicites, aucun faux état connecté déduit du seul toggle. Ne pas modifier la sélection build des connecteurs.
6. Profil complet : état stable « Profil prêt », pas de gain estimé zéro ni répétition des mêmes cartes. Profil incomplet : une suggestion concrète prioritaire avec accès à l’action, critères toujours consultables.

Validation : tests de statut/affichage/alertes nécessaires, parcours onboarding et settings, typecheck/lint du périmètre. Rapport à `reports/ux-implementation-2026-10-01/task-2-report.md`.

## Task 3: Suivi accessible et CV contrôlé/exportable

Propriété principale : `ApplicationsPage`, `CvPage`, core/shell CV/LinkedIn, feature flags du domaine et tests/documents concernés. Conserver les transitions fiables livrées en tâche 1.

1. Activer l’onglet suivi local par défaut (`applications: true`), conserver `connected: false` et tous les flags cloud. Prioriser « À relancer » puis détail d’un dossier ; replier l’activité et éviter les représentations répétées en tête. Champ de date/heure de relance pleine largeur, boutons sur ligne distincte à 320/400 px, statut d’enregistrement/effacement et erreurs clairs.
2. Import LinkedIn : récupération puis prévisualisation des expériences nouvelles/modifiées/identiques avant toute fusion ; cases de sélection, validation explicite, annulation sans écriture. Préserver toutes les expériences manuelles et métadonnées, identité canonique/externalId, absence de doublons à l’import répété. Vérifier que la fusion du service worker elle-même conserve les éléments non sélectionnés et ne fait pas une suppression implicite.
3. CV exportable localement : document HTML imprimable (permet « Enregistrer en PDF » dans le navigateur) et/ou Markdown, sans dépendance externe. Choisir une mission pour proposer une version adaptée via sélection/ordre des compétences et expériences existantes ; afficher un aperçu modifiable/validable avant téléchargement. Aucune expérience ou compétence inventée. Échapper le HTML et les URL ; aucune ressource externe ou script dans le document généré. Garder un export CV général possible quand aucun contexte mission.

Validation : tests purs diff/fusion et export (dont contenus HTML hostiles), intégration façade/messaging, E2E import annulation/sélection et export, relance et flag, typecheck/lint du périmètre. Rapport à `reports/ux-implementation-2026-10-01/task-3-report.md`.

## Task 4: TJM segmenté et contexte de l’échantillon

Propriété principale : `TJMPage`, core TJM, types, historique/storage, façades/messaging/background/dev stubs de l’analyse et tests associés.

1. Ajouter des segments explicites métier (catégorie ou métier normalisé), expérience (junior/confirmé/senior) et mode de travail aux régions/périodes existantes, appliqués avant calcul des statistiques. Champs non renseignés présentés comme inconnus et exclus d’un segment précis plutôt qu’inférés abusivement.
2. Faire évoluer les nouveaux enregistrements pour porter les dimensions nécessaires tout en lisant les historiques existants. Ne pas additionner plusieurs occurrences d’une même annonce comme autant d’annonces uniques ; utiliser une population d’annonces/missions avec identité quand nécessaire plutôt que médiane de moyennes déjà agrégées.
3. Présenter médiane et taille de l’échantillon, annonces sans TJM, période/région/segment choisis, fraîcheur et composition à proximité. Parler d’annonces collectées, pas de tout le marché. L’absence de données pour un segment doit rester explicite, sans substituer un échantillon global.

Validation : tests de filtrage croisé, dimensions inconnues/anciens enregistrements, déduplication, calculs/empty et facade/messaging, E2E contrôles de segment, typecheck/lint du périmètre. Rapport à `reports/ux-implementation-2026-10-01/task-4-report.md`.

## Validation finale

Relecture indépendante de chaque tâche puis relecture globale du diff. Exécuter les tests unitaires extension et domaine, lint et typecheck, build standard et contrôle manifest. Exécuter les parcours E2E affectés en Chromium ; inspecter visuellement à 320 et 400 px et vérifier focus/actions/relances/import/export. Corriger les régressions. Documenter les résultats dans un compte rendu permanent, sans présenter les mocks de plateformes, IA, MV3 ou cloud comme des validations réelles.
