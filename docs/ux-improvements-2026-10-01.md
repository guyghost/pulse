# MissionPulse — correctifs et évolutions UX

Livraison locale issue de l’audit du 1er octobre 2026. Le [plan de réalisation](plans/2026-10-01-ux-improvements.md) détaille les critères attendus.

## Feed et candidature

- « Note minimale » applique les seuils A ≥ 80, B ≥ 60 et C ≥ 40. Les anciennes recherches fondées sur des groupes exacts restent interprétées selon leur règle d’origine.
- « Ouvrir pour postuler » ouvre l’annonce puis sélectionne les missions non suivies ou détectées, en conservant les étapes ultérieures. Seule l’action « J’ai envoyé ma candidature » confirme un envoi ; elle respecte les transitions autorisées. Les échecs d’ouverture ou d’enregistrement sont signalés.
- La recherche et les filtres occupent un espace réservé du panneau. Les actions des cartes restent accessibles pendant leur développement et la comparaison.
- Les filtres contiennent le focus clavier, neutralisent le fond et rendent le focus au déclencheur après fermeture.
- Favoris, tris, recherches nommées et retours locaux « Pertinent » / « Hors cible » sont accessibles. Le tri personnalisé utilise ces retours sans modifier la note de la mission. Les écritures préservent les données existantes en cas de lecture lente, d’erreur ou d’annulation d’une suppression.

## Navigation, première utilisation et réglages

- Les onglets gardent leur nom visible. Les contrôles sont adaptés aux panneaux de 320 et 400 px.
- Les actions « Continuer sans source » et « Scanner maintenant » restent visibles sous la liste des sources. Le profil peut être enrichi ensuite.
- Un profil complet affiche « Profil prêt ». Un profil incomplet présente une suggestion prioritaire avec accès au champ à compléter.
- Les alertes expliquent le seuil effectivement configuré, sans modifier les préférences pour obtenir une lettre de note donnée.
- Les réglages distinguent l’IA dans le navigateur du service cloud facultatif, son état effectif et les données transmises. Le titre et la description d’une annonce peuvent eux-mêmes contenir un tarif, un lieu ou d’autres informations.
- Chaque source distingue sélection, vérification de session, besoin de reconnexion et erreur. Les actions d’ouverture et de vérification donnent un retour d’échec exploitable.

## Suivi et CV

- L’onglet Suivi local est activé par défaut. « À relancer » et le dossier prioritaire précèdent les vues secondaires repliées.
- Les relances ont un champ de date/heure pleine largeur, des boutons séparés et des retours de succès/erreur. Une échéance peut être planifiée sur une mission détectée sans changer son statut ; elle apparaît dans les relances et les compteurs. Les dossiers terminés restent exclus.
- Une horloge réactive fait apparaître les échéances pendant que le panneau reste ouvert, avec un tick de 30 secondes et une actualisation immédiate au retour dans Suivi. Le passage du temps ne modifie aucun statut.
- Missions et suivis sont relus ensemble au retour depuis le feed et lors des mises à jour pertinentes. Les réponses anciennes sont ignorées ; le dossier consulté et une date de relance non enregistrée sont conservés lors d’un rafraîchissement.
- Un échec de lecture du catalogue est distinct d’un catalogue vide, depuis le service worker jusqu’à l’interface. Le dernier dossier reste accessible avec sa saisie, une alerte et « Réessayer ». Une lecture vide réussie affiche normalement l’état sans missions.
- L’import LinkedIn présente les expériences nouvelles, modifiées ou identiques, regroupe les doublons et permet de choisir les éléments à confirmer. Annuler n’écrit rien. La fusion conserve les expériences manuelles, les éléments non sélectionnés, le titre et les préférences du profil. Les identifiants positionnels de LinkedIn ne servent pas à associer deux expériences.
- Le CV général ou adapté à une mission est téléchargeable en HTML autonome après validation de son aperçu. L’utilisateur choisit les expériences et compétences existantes, leur ordre et son introduction. Chaque modification demande une nouvelle validation. Les mots-clés de recherche ne deviennent pas des compétences acquises. Le document peut être imprimé avec l’option navigateur « Enregistrer en PDF ».

## Analyse TJM

- Les filtres période, région, métier, expérience et mode de travail sont croisés avant le calcul. Les technologies du profil et le segment choisi restent visibles dans le contexte.
- Les médianes reposent sur des tarifs d’annonces identifiables. Une même annonce rescannée ou citant plusieurs technologies compte une fois. Les annonces sans TJM restent dans le dénominateur ; les groupes absents ne reçoivent aucun tarif de remplacement.
- La collecte utilise les annonces sources éligibles, avant leur regroupement dans le feed. Les annonces écartées par ce regroupement, notamment sans tarif, restent présentes dans la population TJM.
- L’écran TJM se rafraîchit après l’enregistrement réussi de cette population complète et lorsqu’il redevient actif. Le terminal du scan reste indépendant des effets non critiques ; une persistance plus lente ne laisse pas l’écran sur un échantillon partiel.
- Les dimensions absentes restent non renseignées et peuvent être isolées. Le métier utilise la catégorie déjà disponible, sans nouvel appel cloud.
- Le nombre d’annonces, les TJM manquants, les dates des observations et la composition sont proches de la médiane. Les missions déjà stockées alimentent la première analyse sans nouveau scan.
- L’ancien historique agrégé est conservé dans une section séparée. Il ne sert pas à reconstituer des annonces ni à calculer les nouvelles médianes. Une publication sur chaque plateforme demeure une annonce distincte faute d’identité commune démontrée.
- Les publications éliminées avant cette livraison ne peuvent pas être reconstruites à partir du stockage historique ; seules les observations disponibles ou collectées ensuite sont utilisées.

## Vérification finale

Les quatre lots et leurs interactions ont été relus indépendamment. Tous les constats de la relecture finale sont corrigés et approuvés. Source vérifiée : `3c4783dd60aa206780b680ee5929174a47d5814d`, sur la branche locale `work`.

| Contrôle                                                                         | Résultat                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test --concurrency=1 -- --maxWorkers=2`                                    | **5 001 réussites** : extension 4 539, domaine 160, UI 12, dashboard 134, landing 156. Les 51 tests déjà ignorés par le projet restent ignorés (50 conditionnels, 1 permanent). |
| Playwright, Chromium système, 15 fichiers affectés                               | **95 parcours réussis**, dont candidatures, clavier/filtres, onboarding, réglages, import LinkedIn, export CV, relances et TJM.                                                 |
| Contrôle visuel à 320 et 400 px                                                  | Parcours des quatre lots inspectés ; captures finales du feed et du paragraphe cloud lisibles sur les deux largeurs.                                                            |
| `pnpm lint`                                                                      | Succès : zéro erreur, deux avertissements préexistants.                                                                                                                         |
| `pnpm typecheck`                                                                 | Succès sur le monorepo.                                                                                                                                                         |
| `pnpm build`                                                                     | Succès du build standard.                                                                                                                                                       |
| `pnpm --filter @pulse/extension verify-manifest dist/manifest.json --post-build` | Succès du contrôle du manifest MV3 et des artefacts générés.                                                                                                                    |
| Prettier sur les fichiers modifiés                                               | Format contrôlé, y compris documentation et rapports.                                                                                                                           |

Les commandes utilisent Node 22.23.1 et pnpm 10.32.1. Les logs finaux et captures sont conservés dans `/workspace/artifacts/missionpulse-ux-implementation-2026-10-01/`. La [relecture finale des correctifs](../reports/ux-implementation-2026-10-01/final-fix-review.md) détaille les six constats levés.

Les contrôles du navigateur en mode développement utilisent les API Chrome et les plateformes simulées. Ils ne prouvent pas les sessions réelles des plateformes ou de LinkedIn, le fonctionnement d’une installation MV3, Gemini Nano, un service cloud, les notifications système ou l’impression PDF native. Le document HTML exporté est testé ; l’impression relève du navigateur. Aucun service connecté ou connecteur exclu du build standard n’est activé par cette livraison.
