# Relecture globale finale — MissionPulse UX

Base `ea8c7b6220725645d84262bfedad24469cf6fc0b`, HEAD examiné `3b372a455e336cc2961a9a151d00dd61467c753d`. Date : 1er octobre 2026.

**Spec : incomplète sur trois interactions de cycle de vie. Qualité : corrections demandées avant approbation globale.** Aucun Critical identifié. Trois Important produits prouvés, deux Minor visuels confirmés et un Minor de maintenance des contrôles. Les corrections déjà approuvées des quatre lots restent acquises ; cette passe ne rouvre pas leurs audits individuels.

## Important I1 — Une relance future ne devient jamais échue sans mutation du suivi ou rechargement complet

Localisation : `apps/extension/src/ui/pages/ApplicationsPage.svelte:182`, `:191` et `:214`, avec le maintien du composant monté à `apps/extension/src/sidepanel/App.svelte:642`.

Les dérivés du compteur, de la recommandation et de la liste échue lisent `Date.now()` sans dépendance réactive au temps. Aucune activation n’est passée à ApplicationsPage ; la navigation masque le composant avec `inert` et `aria-hidden` mais ne le remonte pas. Le store de suivi n’introduit pas de tick ou de rafraîchissement indirect.

**Preuve ciblée indépendante, Chromium système et vraie UI de développement :** commencer sans suivi, à 12:00 le 1er octobre, enregistrer une relance pour 12:01 ; avancer l’horloge et les timers du navigateur de deux minutes. L’enregistrement est confirmé, mais « À relancer (0) » demeure à 12:02. Quitter puis rouvrir Suivi conserve zéro. Un rechargement complet donne immédiatement « À relancer (1) » pour la même donnée persistée. Aucune erreur JavaScript de page relevée.

Impact : l’utilisateur laisse son panneau ouvert et manque une échéance pourtant correctement enregistrée. La conformité du prédicat pur passé/futur, vérifiée au lot 3, ne couvre pas ce passage du temps.

Correction attendue : utiliser une horloge réactive partagée (`lib/state/clock.svelte.ts` existe), alimenter de manière cohérente liste/compteurs/recommandation et rafraîchir à la reprise pertinente. Vérifier le passage futur→échu sans écriture, ainsi que le retour dans Suivi déjà monté. Aucun changement de statut ne doit être déduit du temps.

## Important I2 — Un dossier créé depuis le feed après la première visite de Suivi reste absent

Localisation : `apps/extension/src/ui/pages/ApplicationsPage.svelte:45`, `:500` et `:518`, avec `apps/extension/src/sidepanel/App.svelte:656` et `apps/extension/src/lib/state/tracking.svelte.ts:25`.

ApplicationsPage possède son propre store de suivi et son propre tableau de missions. `loadApplications()` est appelé au montage et au retry d’erreur ; le seul abonnement de la page traite `PROFILE_UPDATED` pour la disponibilité. Ni l’arrivée de missions, ni un suivi modifié ailleurs, ni la réactivation de la page ne rechargent ces données. Les réponses `TRACKING_UPDATED` reçues par le store du feed ne mettent pas à jour celui de Suivi.

**Preuve ciblée :** première visite de Suivi avec zéro suivi ; retour au feed ; injection d’une nouvelle mission dans le catalogue de développement puis vraie action « Ouvrir pour postuler » sur sa carte. Le bridge `GET_TRACKINGS` confirme `missionId=review-new-mission`, `currentStatus=selected`. La réouverture de Suivi conserve les dix missions antérieures, aucun dossier suivi et aucune occurrence de la nouvelle mission. Le rechargement complet la rend visible. La création est donc sauvegardée, mais son résultat est inaccessible dans la page qui doit l’exposer. La sonde utilise l’injection de catalogue après première visite pour isoler l’arrivée ; elle ne prétend pas avoir exécuté un connecteur réel.

Correction attendue : recharger ou synchroniser **missions et suivis** à l’activation et aux mises à jour pertinentes, avec protection contre les réponses tardives et erreurs visibles. Ne pas seulement remplacer le tableau de missions : les deux instantanés sont indépendants. Couvrir aussi une modification de statut d’une mission déjà connue depuis le feed, et préserver les saisies de relance en cours lors d’un rafraîchissement.

## Important I3 — Le rafraîchissement TJM peut précéder la persistance de sa population complète et rester faux

Localisation : `apps/extension/src/lib/state/tjm-page.svelte.ts:123`, `apps/extension/src/background/index.ts:832` puis `:853`/`:1237`, et `apps/extension/src/ui/pages/TJMPage.svelte:88`.

Le worker publie `SCAN_COMPLETE` **avant** `persistPostCommitEffects`, qui enregistre les observations de toutes les annonces sources. Le nouvel écran TJM rafraîchit dès `SCAN_COMPLETE`. À cet instant, une lecture peut disposer des gagnantes du feed déjà committées mais pas encore des publications écartées par la déduplication. Aucun message après réussite de la persistance TJM n’invalide cette première réponse. Revenir dans TJM avec les filtres par défaut ne rafraîchit pas non plus : l’effet d’activation n’appelle `reset()` que si un filtre avait changé.

**Preuve ciblée d’ordonnancement, sans prétendre mesurer la latence MV3 :** navigateur neuf, une annonce à 600 €/j, écran TJM monté ; livraison du message `SCAN_COMPLETE` à l’abonnement réel, puis écriture retardée d’une seconde observation identifiable sans tarif dans le vrai stockage du stub. Une lecture directe via `GET_TJM_ANALYSIS` renvoie alors **2 annonces, 1 avec TJM, 1 sans TJM**, tandis que l’écran conserve **1 annonce, 1 avec TJM, 0 sans TJM**. Quitter/réouvrir sans filtre conserve la population incomplète. Choisir « 30 jours » montre immédiatement 2/1/1. La date des deux observations est identique et incluse dans les deux périodes : le changement vient bien du rafraîchissement.

Cette sonde contrôle volontairement le retard de persistance autorisé par l’ordre réel du worker. Elle démontre le défaut de publication/invalidation, indépendamment de la fréquence à laquelle le stockage réel est assez rapide pour masquer la course. Le correctif de collecte du lot 4 reste valide : après persistance, le calcul canonique possède bien les annonces perdues par le feed.

Correction attendue : rendre l’écran cohérent après la réussite de la persistance des observations, par une invalidation dédiée ou un mécanisme de lecture équivalent. Préserver le contrat existant de terminal de scan rapide et non révisé par un effet non critique ; ne pas bloquer simplement `SCAN_COMPLETE` derrière toutes les projections. Couvrir le terminal suivi d’une persistance retardée, le cas des publications sans TJM écartées du feed et la réactivation sans filtre.

## Minor M1 — Le titre prioritaire devient un chiffre isolé à 320 px

Localisation : `apps/extension/src/ui/molecules/OperationalStoryCard.svelte:115` et `:118`, utilisé en mode inline par `apps/extension/src/ui/pages/FeedPage.svelte:1307`.

Capture `feed-final-320.png` inspectée : l’icône puis « 3 » apparaissent à gauche de « Voir les 3 missions prioritaires ». La colonne automatique du bouton absorbe la place du titre tronqué. Le bouton reste utilisable, mais le message prioritaire perd son sens visible ; l’absence de débordement horizontal ne valide pas sa lisibilité.

Correction attendue : conserver un libellé court intelligible ou réserver une ligne au titre à petite largeur. Vérifier le texte visible à 320 et 400 px, sans supprimer le contexte accessible.

## Minor M2 — L’explication cloud approuvée devient une colonne extrêmement étroite

Localisation : `apps/extension/src/ui/pages/SettingsPage.svelte:869` et `:878`.

Capture `settings-cloud-final-320.png` inspectée : le paragraphe complet partage la ligne flex de l’icône et du switch ; il s’étale sur une colonne d’environ 110 px et presque toute la hauteur du panneau. L’information reste présente mais son examen avant activation devient pénible.

Correction attendue : mettre le paragraphe sous la ligne titre/interrupteur, sur la largeur utile de la carte. Conserver la précision du payload déjà approuvée, l’état effectif et le blocage sans clé.

## Minor M3 — Contrôles de non-régression restés attachés aux anciens écrans ou à des fixtures instables

Il s’agit de défauts des preuves automatisées, pas de six nouveaux défauts produit. Ils doivent toutefois être corrigés pour obtenir une validation finale verte.

- `tests/unit/ui/operational-ui-constraints.test.ts:369` exige encore `inspectLocalSignals` et l’ancien récit TJM. Le nouvel écran expose directement l’échantillon local et son contexte ; les tests runtime `TJMPage.test.ts` et `e2e/tjm.test.ts` couvrent le cache hors ligne. Adapter le contrôle au comportement utile plutôt que restaurer un bouton supprimé.
- Même fichier `:411` exige `handleApplicationStoryAction`, `openRecommendedDossier` et l’ancienne carte recommandée. Le dossier prioritaire est maintenant sélectionné directement après la liste des relances ; `ApplicationsPage.test.ts` contrôle cette priorité et l’activité repliée. Préserver la protection contre une recommandation terminale et compléter avec I1/I2, sans exiger les anciens noms de fonctions.
- `tests/e2e/feed-daily-commands.test.ts:9` et `:91` choisissent `.first()` parmi des mocks aux scores aléatoires et statuts préexistants. Les contextes d’échec à 400 px et d’ouverture refusée montrent une mission déjà Envoyée : l’attente Sélectionnée ou d’une nouvelle confirmation d’envoi est invalide. Fixer une mission identifiée et un statut initial voulu.
- Le scénario daily à 320 px atteint bien Sélectionnée, mais son bouton a pour nom accessible « Passer le statut à J’ai envoyé ma candidature » ; `:32` attend exactement « J’ai envoyé ma candidature ». Le correctif du doublon a gardé le bouton de transition canonique. Adapter le locator au nom accessible retenu, en conservant la vérification d’une seule confirmation et de son effet.
- `tests/e2e/applications-pipeline.test.ts:58` et le helper de scan partiel de `tests/e2e/feed.test.ts:114` remplacent le global `window.chrome` ; le contrôleur a confirmé l’échec de ce harness dans Chromium système. Les contextes montrent les données de démo au lieu des missions de fixture. Employer l’interception du runtime disponible, déjà utilisée par les lots précédents, et vérifier que la fixture est effectivement installée avant les actions.
- `tests/e2e/feed.test.ts:591` cherche encore le bouton exact « Remote ». Le texte produit demandé et rendu est « Télétravail ». Adapter l’assertion ARIA et conserver le contrôle de `aria-pressed`.

## Preuves, conformité conservée et limites

Lecture du brief/package final, d’AGENTS.md, du plan et de la documentation finale, des briefs/rapports/correctifs des quatre lots, du diff global et des chemins connexes nécessaires aux interactions ci-dessus. Aucun code source, test de dépôt, configuration ou flag modifié. Aucun sous-agent, compte réel, cloud, push ou suite générale supplémentaire. Seuls ce rapport et les artefacts des sondes sont ajoutés.

Les corrections de recherches/undo et de lecture avant remplacement restent cohérentes ; les intentions candidature séparent toujours ouverture et envoi explicite, les étapes ultérieures sont préservées. L’import conserve les expériences non sélectionnées/manuelles et l’export utilise des faits existants échappés avec validation. Les dimensions TJM inconnues et l’historique agrégé restent séparés ; worker, stub et schémas emploient le nouveau contrat. Les flags activent Suivi local sans activer la couche connectée. Aucun nouveau défaut identifié sur ces contrats dans cette passe.

Preuves globales existantes, sans relance par le relecteur : **4 525 tests extension réussis, 2 assertions structurelles en échec, 51 skips préexistants**, domaine 160, UI 12, landing 156 réussis ; dashboard non atteint dans cette exécution failfast. Le log E2E final consulté sur HEAD examiné donne **85 réussis / 6 échecs en 3,5 min**, avec les six scénarios explicités en M3. Les validations ciblées, builds/typechecks/lints des lots sont consignés dans leurs rapports ; ces résultats ne remplacent pas les contrôles complets prévus après la vague corrective.

Artefacts indépendants conservés sous `/workspace/artifacts/missionpulse-ux-implementation-2026-10-01/` :

- `mp-final-lifecycle.cjs` et `mp-final-lifecycle.log` : I1/I2 ; sondes terminées, aucune erreur JavaScript de page relevée pour la première session instrumentée.
- `mp-final-tjm-order.cjs` et `mp-final-tjm-order.log` : I3 ; état de l’UI et réponse canonique avant/après écriture retardée, puis filtre.
- `feed-final-320.png` et `settings-cloud-final-320.png` : M1/M2, captures préexistantes inspectées.
- `unit-tests.log`, `e2e-tests.log` et `e2e-results/` : preuves globales du contrôleur et contextes d’échec consultés.

**Cannot verify :** sessions réelles de plateformes/LinkedIn, permissions MV3 installées, Gemini Nano réel, notifications système, conservation effective chez un prestataire cloud et impression PDF native. La sonde I3 ne mesure pas les timings réels Chrome/IndexedDB : elle contrôle une séquence permise par l’ordre de publication relu. Aucun nouveau défaut n’est attribué à ces systèmes externes. Les manipulations HMR interrompues mentionnées dans les rapports ne sont pas comptées comme validations.

## Vague corrective unique puis relecture ciblée

Traiter I1/I2 ensemble pour le cycle de vie de Suivi, I3 pour l’invalidation de population TJM, M1/M2 pour la lisibilité à 320 px et M3 pour des contrôles déterministes conservant leurs garanties. Ajouter uniquement les régressions ciblées justifiées par ces constats. La relecture suivante doit vérifier ces six points et leurs effets directs : échéance sans mutation, feed→Suivi déjà monté, persistance TJM retardée, deux rendus étroits et validité des assertions adaptées. Elle ne doit pas recommencer les quatre audits. L’approbation globale reste suspendue à cette correction et aux vérifications finales du contrôleur.
