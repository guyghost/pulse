# Pulse Apple Design Principles Audit

Date: 2026-06-24

## Scope and Evidence

Audit réalisé sur le monorepo local Pulse, avec captures produites pendant cette session.

Surfaces auditées:

- Extension Chrome dev side panel: Feed, Onboarding, Profil, CV, Suivi, TJM, Réglages, états vide/chargement/erreur, investigation mission, confirmation de suppression.
- Dashboard connecté: état public sans compte et sans extension connectée, feed connecté vide, TJM, comparaison, candidatures, CV, synchronisation, données/export.
- Landing/auth: hero, login, register.

Captures de référence:

- Extension: `output/playwright/pulse-apple-design-audit/01-extension-feed-loaded.png` à `13-extension-onboarding.png`
- Dashboard: `output/playwright/pulse-apple-design-audit/14-dashboard-overview.png` à `21-dashboard-data-export.png`
- Landing/auth: `output/playwright/pulse-apple-design-audit/22-landing-home-hero.png` à `26-landing-login-mobile.png`

Limites:

- Le dashboard authentifié avec données réelles n'a pas été audité, faute de session connectée. L'audit couvre l'état prévu par le produit quand aucun backend/compte n'est disponible.
- L'accessibilité est évaluée visuellement et structurellement à partir des écrans et du code lu, pas par audit lecteur d'écran complet.
- Les notifications Chrome natives, permissions navigateur réelles et Gemini Nano réel n'ont pas été déclenchés.
- Les vues Equipes et Projets ne sont pas présentes comme écrans dédiés dans le produit actuel.

## Score global

**70 / 100**

Pulse a une direction produit claire et beaucoup de bons instincts: cartes de situation, preuve, action recommandée, confidentialité locale, états vides utiles, et une vraie tentative de transformer un feed de missions en outil de décision. Le niveau "premium" est perceptible dans les meilleures surfaces, surtout le Feed, l'investigation mission et les confirmations destructrices.

Le produit n'atteint pas encore un niveau Apple/Linear/Arc parce que la hiérarchie reste souvent trop bavarde, la navigation mélange extension, compte, sync, CV, TJM et candidature sans modèle mental unique, et certains détails de craft cassent la confiance, notamment le login. L'expérience est plus mûre côté intention que côté simplicité.

## Résumé exécutif

Pulse sait déjà répondre à une question importante: "Que dois-je traiter maintenant ?". Le Feed, les cartes opérationnelles et les états d'erreur montrent une maturité UX supérieure à une extension de scraping classique. L'UI est cohérente avec le design system Analytical Blueprint, sobre, claire, et généralement lisible. Les forces principales sont la priorisation, la transparence locale, les confirmations à impact explicite et les états vides actionnables.

Les faiblesses principales sont la densité cognitive, la fragmentation entre extension et dashboard, la découvrabilité des fonctions premium, et des incohérences de finition sur l'auth et certains états dashboard vides. Le produit semble parfois expliquer son architecture interne au lieu de guider l'utilisateur vers la prochaine décision. La plus grande opportunité est de formaliser un modèle unique: situation, preuve, décision, action, résultat. En priorité, il faut simplifier les pages denses, clarifier sync/compte/premium, corriger le craft auth, et ajouter du contrôle utilisateur visible: undo, historique, explication IA et traçabilité.

## Scores par principe

- Purpose: **8 / 10**
- Agency: **7 / 10**
- Responsibility: **8 / 10**
- Familiarity: **7 / 10**
- Flexibility: **6 / 10**
- Simplicity: **6 / 10**
- Craft: **7 / 10**
- Delight: **7 / 10**

## Analyse par principe

### Purpose - Intention

Ce qui fonctionne:

- Les pages principales ont une intention visible: Feed pour traiter les missions, Profil pour améliorer le scoring, CV pour homogénéiser le profil, Suivi pour relancer, TJM pour négocier, Réglages pour configurer.
- Les `OperationalStoryCard` donnent un statut, des preuves et un CTA. C'est le meilleur pattern du produit.
- Les états vides ne sont pas décoratifs: ils disent pourquoi rien n'est affiché et quoi faire ensuite.

Friction:

- Certaines pages affichent encore plusieurs intentions concurrentes. CV combine import LinkedIn, sélection de champs, payload, vérification, synchronisation et plateforme. Réglages combine profil, scan, alertes, compte, apparence, export, sauvegarde, IA, onboarding et danger zone.
- Le dashboard vide affiche une intention claire en haut, puis beaucoup de surfaces vides qui répètent "connecter l'extension".

Recommandation:

- Pour chaque page, imposer une seule phrase de décision: "La prochaine action utile est X parce que Y".
- Déplacer les détails secondaires dans des sections progressives.

### Agency - Autonomie

Ce qui fonctionne:

- Les filtres, vues sauvegardées, favoris, masquage, comparaison et recherche donnent du contrôle.
- Les actions destructrices demandent une saisie explicite: `SUPPRIMER` ou `RESTAURER`.
- Les recommandations IA/score ne bloquent pas l'usage: le score de base prend le relais.

Friction:

- Les actions fréquentes comme masquer une mission, changer un statut ou générer un kit n'exposent pas toujours un undo visible.
- Les pages premium disparaissent de la navigation si l'utilisateur n'est pas premium, ce qui peut réduire l'agence: l'utilisateur ne comprend pas toujours ce qui existe, ce qui est verrouillé, et pourquoi.
- Les automatisations/alertes sont présentes, mais leur historique et leur impact futur ne sont pas assez visibles.

Recommandation:

- Ajouter undo pour masquer, favori, changement de statut, suppression de vue, modification d'alerte.
- Préférer des écrans verrouillés explicatifs aux pages totalement masquées pour le premium.
- Ajouter un journal léger: scans, alertes déclenchées, décisions IA, exports, sync.

### Responsibility - Responsabilité

Ce qui fonctionne:

- La copie répète que les sessions plateforme restent dans Chrome et que le dashboard ne lit pas directement les cookies.
- L'IA locale est présentée comme optionnelle, avec fallback.
- Les confirmations destructrices expliquent l'impact et la prochaine action.

Friction:

- Le dashboard affiche dans la sidebar "Extension Chrome" avec un point vert alors que la page dit "Aucune extension connectée". C'est un risque de confiance.
- La distinction entre fait, hypothèse, score calculé, score IA et recommandation n'est pas encore assez explicite.
- Le login explique le lien email et le passkey, mais pas clairement la confidentialité, la durée du lien ou ce qui sera synchronisé après connexion.

Recommandation:

- Corriger les signaux contradictoires du dashboard non connecté.
- Ajouter une micro-explication "Pourquoi ce score ?" sur cartes mission et story cards.
- Ajouter un panneau "Données utilisées" pour IA, sync, notifications et export.

### Familiarity - Familiarité

Ce qui fonctionne:

- Navigation par onglets dans l'extension, sidebar dans le dashboard, cartes, badges, filtres, inputs, modales et confirmation destructrice suivent des conventions connues.
- Les icônes lucide et les boutons icon-only ont souvent `aria-label` et tooltip.
- Le dashboard utilise une IA de SaaS opérationnel familière: sidebar, sticky header, filtres, cards.

Friction:

- La navigation extension devient surtout icon-only sur certains états. C'est compact, mais moins explicite pour les utilisateurs occasionnels.
- Les mêmes concepts changent de nom: "Suivi", "Candidatures", "Pipeline", "Applications" côté code, "Dashboard connecté", "cockpit".
- Le login rompt la familiarité visuelle: label et input email apparaissent inline sur desktop et mobile, contrairement au register.

Recommandation:

- Stabiliser le vocabulaire: Feed, Profil, CV, Candidatures, TJM, Réglages, Dashboard.
- Garder un label visible pour les destinations critiques, même en mode dense.
- Corriger le formulaire login pour reprendre exactement le pattern register.

### Flexibility - Flexibilité

Ce qui fonctionne:

- Extension capturée à 390px: l'interface est globalement utilisable en largeur side panel.
- Dashboard desktop et mobile répondent correctement dans les zones principales.
- Les états offline, vide, loading, erreur et sans compte sont prévus.

Friction:

- Le side panel empile beaucoup de cartes avant la liste. Sur petit écran, la mission utile est souvent sous le pli.
- Le dashboard mobile reste lisible, mais il affiche de longs blocs explicatifs avant la première action concrète.
- Les gros volumes de données sont partiellement adressés par virtualisation, mais les dashboards vides créent de très grands espaces blancs.

Recommandation:

- Ajouter un mode compact permanent pour le Feed: situation + action queue + liste.
- Pour les dashboards vides, remplacer les grilles vides par une checklist de setup.
- Tester zoom 200%, navigation clavier complète, dark mode et refus permissions dans un audit dédié.

### Simplicity - Simplicité

Ce qui fonctionne:

- Les story cards simplifient bien la situation quand elles restent seules.
- Les états vides résument le problème et l'action.
- La confirmation destructrice évite les textes juridiques longs et garde un langage d'impact.

Friction:

- Trop de surfaces ont trois niveaux de messages: badge, titre, description, evidence cards, CTA, puis cards secondaires. Le pattern est bon, mais trop répété dans le même viewport.
- Le Feed montre source health, story, score distribution, insights, recherche, filtres et scroll cue avant que l'utilisateur traite une mission.
- Réglages est une page catalogue. Elle devrait être un centre de contrôle par résultat.

Recommandation:

- Réduire chaque page à une question principale.
- Masquer les preuves secondaires derrière "Voir pourquoi" quand le statut est normal.
- Transformer Réglages en quatre sections: Sources, Alertes, Données, Compte/IA.

### Craft - Savoir-faire

Ce qui fonctionne:

- L'extension a un craft solide: alignements, badges, spacing compact, skeletons, transitions, boutons iconés et confirmations sont cohérents.
- Les cartes décisionnelles sont visuellement premium, surtout dans Feed, CV, Profil, TJM.
- Les tokens du design system sont globalement respectés: canvas clair, blue CTA, surfaces blanches, status colors.

Friction:

- P1: Login email inline cassé sur desktop et mobile. Cela donne une impression de formulaire non fini.
- P1: Signal contradictoire du dashboard non connecté: point vert "Extension Chrome" malgré "Aucune extension connectée".
- P2: Le dashboard vide crée de grands vides et des sections partiellement hors contexte.
- P2: La landing hero est très premium mais l'énorme headline peut repousser la preuve produit hors viewport.
- P3: Certains textes ont encore des accents absents ou des formulations techniques visibles.

Recommandation:

- Créer une checklist craft avant release: formulaire, empty states, mobile, contraste, focus, wording, overflow, états non connectés.
- Factoriser les auth forms pour éviter divergence login/register.

### Delight - Plaisir

Ce qui fonctionne:

- Le delight vient du sentiment de contrôle: "10 nouvelles missions", "1 relance due", "profil 86%", "TJM cohérent".
- Le drawer d'investigation donne une réponse rapide et rassurante.
- Les confirmations destructrices donnent une sensation de produit responsable.

Friction:

- Le produit explique beaucoup. Le delight baisse quand l'utilisateur doit lire plusieurs cartes avant d'agir.
- Les moments de succès ne sont pas encore très mémorables: première mission qualifiée, première relance traitée, premier CV synchronisé, premier rapport exporté.
- Le dashboard vide ne transforme pas assez l'absence de données en progression guidée.

Recommandation:

- Ajouter des moments de clarté rapide: action terminée, mission promue en suivi, alerte créée, CV prêt, export généré.
- Le delight doit venir de la vitesse perçue et de la réduction du doute, pas d'effets décoratifs.

## Audit détaillé par écran

### Landing

Evidence: `22-landing-home-hero.png`

Intention principale: expliquer la promesse MissionPulse et installer l'extension.

Points forts:

- Très forte présence de marque.
- Style distinctif, premium, conforme au design system.
- Navigation simple et calme.

Problèmes observés:

- Le hero consomme presque tout le viewport avec une phrase typographique. La preuve produit et l'action concrète sont peu visibles au premier écran.
- L'offre "extension Chrome, scan gratuit, premium optionnel" est claire mais secondaire.

Friction utilisateur:

- Un utilisateur prêt à installer doit chercher le CTA et comprendre le produit surtout par la promesse, pas par une démonstration.

Recommandations:

- Garder le craft typographique, mais faire apparaître une preuve produit ou un mini cockpit dès le premier viewport.
- Rendre "Installer" plus actionnable avec un CTA primaire visible dans le hero.

Priorité: P2.

### Login

Evidence: `23-landing-login.png`, `26-landing-login-mobile.png`

Intention principale: ouvrir le compte pour accéder au dashboard.

Points forts:

- Le titre s'adapte à l'intention de redirection.
- Email link et passkey sont proposés sans mot de passe.

Problèmes observés:

- P1 craft: le label Email et l'input sont inline, avec un champ très étroit. Le problème est visible desktop et mobile.
- Le bouton passkey ressemble à du texte plutôt qu'à une action secondaire.
- La note passkey parle de Supabase, ce qui expose un détail fournisseur.

Friction utilisateur:

- La confiance baisse sur un écran critique. Le login est souvent la première interaction de compte.

Recommandations:

- Réutiliser exactement la structure CSS du register: `.form-group`, label au-dessus, input full width.
- Remplacer "Supabase l'autorise" par une phrase produit: "Disponible selon votre navigateur et votre compte".
- Donner au passkey un vrai bouton secondaire.

Priorité: P1.

### Register

Evidence: `24-landing-register.png`

Intention principale: créer un compte par lien sécurisé.

Points forts:

- Formulaire clair, centré, input full width.
- Effort réduit: pas de mot de passe.

Problèmes observés:

- Le wording "creation" manque d'accent et semble moins fini.
- Pas d'explication concise sur ce qui sera synchronisé après création du compte.

Friction utilisateur:

- L'utilisateur peut se demander pourquoi créer un compte si l'extension fonctionne localement.

Recommandations:

- Ajouter une ligne: "Le compte synchronise uniquement snapshots, CV, préférences et candidatures - jamais vos sessions plateforme."
- Aligner microcopy et accents.

Priorité: P2.

### Onboarding

Evidence: `13-extension-onboarding.png`

Intention principale: affiner le radar après premiers signaux.

Points forts:

- Très bon cadrage: "Le but n'est pas d'afficher plus de missions."
- Progression 1/5 claire.
- La proposition de valeur est orientée décision, pas configuration.

Problèmes observés:

- Le haut conserve une navigation icon-only qui peut distraire pendant l'onboarding.
- La page bascule entre pédagogie et saisie de profil; il faut veiller à ne pas trop expliquer avant l'action.

Friction utilisateur:

- Un nouveau venu peut lire beaucoup avant de comprendre combien de temps prendra la configuration.

Recommandations:

- Ajouter une estimation courte: "2 minutes, modifiable ensuite".
- Pendant onboarding, réduire la navigation au minimum: retour/ignorer, pas tout le shell.

Priorité: P2.

### Extension Shell et Navigation

Evidence: `01-extension-feed-loaded.png`, `06-extension-profile.png`

Intention principale: naviguer entre les surfaces locales.

Points forts:

- Navigation compacte adaptée au side panel.
- Icônes standards et état actif clair.
- Les pages premium sont disponibles en dev et cohérentes.

Problèmes observés:

- En mode dense, les destinations deviennent icon-only pour les pages non actives.
- Le masquage complet des pages premium hors premium peut cacher la valeur du produit.

Friction utilisateur:

- La mémorisation des icônes est nécessaire pour revenir rapidement sur CV, Suivi, TJM.

Recommandations:

- Garder labels actifs et au moins tooltips persistants/accessibles pour destinations.
- Pour le premium, afficher les entrées verrouillées avec une explication courte plutôt que les retirer.

Priorité: P2.

### Feed - Dashboard principal extension

Evidence: `01-extension-feed-loaded.png`

Intention principale: savoir quelles missions traiter maintenant.

Points forts:

- La story card répond clairement: nouvelles missions, seuil d'alerte, sources.
- Score distribution et insights transforment la liste en cockpit.
- Source health en haut renforce la confiance.
- Scroll cue vers les missions utile quand la liste est sous le pli.

Problèmes observés:

- Beaucoup d'informations avant la première carte mission.
- Plusieurs éléments se disputent le rôle d'action principale: scan, story CTA, filtres, source row, scroll cue.
- Les source pills sont très compactes et partiellement icon-only.

Friction utilisateur:

- L'utilisateur doit lire le cockpit avant de traiter la mission la plus importante.

Recommandations:

- Mettre une "Action Queue" de 1 à 3 actions juste après la story: traiter mission prioritaire, corriger source, relancer scan.
- Faire de la liste mission un élément plus visible au premier viewport si des missions existent.
- Masquer les insights secondaires quand tout est normal.

Priorité: P1.

### Mission Detail / Investigation

Evidence: `02-extension-feed-investigation-drawer.png`

Intention principale: décider rapidement si une mission mérite une action.

Points forts:

- Très bon écran: décision, score, TJM, source, preuves et détails techniques.
- Le drawer conserve le contexte mental du feed.
- CTA clair: ouvrir la mission.

Problèmes observés:

- Le CTA principal sort vers la plateforme, mais le drawer ne propose pas directement "Mettre en suivi" ou "Comparer".
- L'explication du score reste synthétique. On comprend la conclusion, moins le calcul.

Friction utilisateur:

- Pour transformer une décision en pipeline, l'utilisateur doit revenir ou passer par une autre surface.

Recommandations:

- Ajouter actions secondaires visibles: "Ajouter au suivi", "Comparer", "Masquer".
- Ajouter un détail "Pourquoi ce score ?" en disclosure.

Priorité: P1.

### Search and Filters

Evidence: `01-extension-feed-loaded.png`, `03-extension-feed-empty-state.png`

Intention principale: réduire le bruit.

Points forts:

- Recherche, favoris, ignorées, tri, filtres, vues sauvegardées.
- Le filtre actif est visuellement signalé.

Problèmes observés:

- Les contrôles sont très petits et iconiques.
- Les filtres sont une boîte d'outils, pas encore une aide à la décision.

Friction utilisateur:

- Un utilisateur non expert peut chercher "comment obtenir moins de bruit" plutôt que "quel filtre utiliser".

Recommandations:

- Ajouter des presets métier: "Prioritaires", "Remote compatible", "TJM à négocier", "Nouvelles seulement".
- Donner des libellés plus visibles aux actions critiques, pas seulement des icônes.

Priorité: P2.

### Profile

Evidence: `06-extension-profile.png`

Intention principale: améliorer la qualité du radar.

Points forts:

- Le lien entre complétude et scoring est explicite.
- La page dit quel élément manque et pourquoi.
- Le CTA "Modifier le profil" est clair.

Problèmes observés:

- Le profil reste une page formulaire sous une bonne story card.
- Le pourcentage 86% est utile mais pas entièrement explicable sans lire les champs.

Friction utilisateur:

- L'utilisateur sait qu'il manque un élément, mais pas toujours l'impact quantifié de chaque champ.

Recommandations:

- Prioriser les champs par impact: stack, TJM, remote, localisation, mots-clés.
- Ajouter un mini simulateur: "Ajouter mots-clés peut améliorer recherche et alertes".

Priorité: P2.

### CV

Evidence: `07-extension-cv.png`, `19-dashboard-cv.png`

Intention principale: maintenir un profil canonique cohérent partout.

Points forts:

- Vision responsable: préparation locale, sync dashboard après connexion.
- La story "Cohérence CV" est rassurante.
- Le dashboard expose l'état vide et les préconditions.

Problèmes observés:

- La page extension mélange import LinkedIn, payload à pousser, sélection de champs, preview, vérification par plateforme.
- Le dashboard CV non connecté crée une grande zone vide avec beaucoup de contenu dans la colonne droite.
- "En attente de compte" et "CV synchronisé" peuvent sembler contradictoires.

Friction utilisateur:

- L'utilisateur ne sait pas si la prochaine action est importer, compléter, prévisualiser, copier, pousser ou connecter.

Recommandations:

- Découper en trois étapes: Source canonique, Plateformes à mettre à jour, Sync dashboard.
- Renommer "CV synchronisé" en "CV canonique" tant que le compte n'est pas connecté.

Priorité: P1.

### Applications / Suivi

Evidence: `08-extension-applications.png`, `18-dashboard-applications.png`

Intention principale: traiter les relances et transformer les missions en pipeline.

Points forts:

- Très bon focus sur les relances dues.
- Pipeline summary clair: actives, relances, prêtes, conversion.
- Les statuts et prochaines actions sont concrets.

Problèmes observés:

- La première vue extension met la synthèse au-dessus de la liste, mais la mission à relancer reste sous le pli.
- Les changements de statut n'exposent pas undo ou historique directement dans l'action.
- Le dashboard vide affiche une carte "Aucune mission trouvée" dans un grand espace, avec la colonne CV à droite.

Friction utilisateur:

- Pour une relance due, le chemin devrait être presque immédiat: ouvrir dossier, envoyer, reporter, marquer traité.

Recommandations:

- Ajouter une carte "Dossier recommandé" visible dans le premier viewport.
- Ajouter undo et timestamp après changement de statut.
- Dashboard vide: remplacer les grids vides par une checklist de connexion.

Priorité: P1.

### TJM / Indicateurs

Evidence: `09-extension-tjm.png`, `16-dashboard-tjm.png`

Intention principale: aider à décider une fourchette de négociation.

Points forts:

- Extension: bonne synthèse "Le radar TJM peut guider la prochaine négociation".
- Les preuves sont claires: analyse, points, profil.
- Dashboard: les indicateurs vides sont honnêtes et lisibles.

Problèmes observés:

- L'action principale "Rafraîchir" n'est pas forcément l'action métier la plus utile.
- Le dashboard sans données affiche plusieurs N/A, ce qui est exact mais peu guidant.

Friction utilisateur:

- L'utilisateur veut savoir "combien demander maintenant ?", pas seulement rafraîchir.

Recommandations:

- CTA métier: "Ajuster mon TJM cible" ou "Voir missions qui justifient ce TJM".
- Pour N/A, afficher "3 étapes pour alimenter le radar".

Priorité: P2.

### Alerts and Notifications

Evidence: `10-extension-settings-top.png`, `01-extension-feed-loaded.png`

Intention principale: faire remonter les missions importantes sans bruit.

Points forts:

- Les alertes sont reliées au score et au seuil.
- Les missions dépassant le seuil sont visibles dans la story.

Problèmes observés:

- Pas de centre de notifications visible dans les captures.
- La fréquence, l'historique et le dernier déclenchement ne sont pas exposés.

Friction utilisateur:

- L'utilisateur peut activer une alerte sans comprendre son volume futur.

Recommandations:

- Ajouter un aperçu: "avec vos données actuelles, cette alerte aurait notifié X missions".
- Ajouter historique des notifications et mute temporaire.

Priorité: P2.

### Settings

Evidence: `10-extension-settings-top.png`, `11-extension-settings-danger-zone.png`

Intention principale: configurer sources, compte, alertes, données et IA.

Points forts:

- Les story cards rendent les réglages plus décisionnels.
- Les sections sensibles expliquent le local-first et la synchronisation.
- Apparence, export, sauvegarde, IA et onboarding sont accessibles.

Problèmes observés:

- Page trop longue et trop large fonctionnellement.
- Les réglages profil sont dupliqués avec la page Profil.
- La story système peut pointer vers IA alors que la page contient beaucoup d'autres priorités.

Friction utilisateur:

- Les réglages ressemblent encore à une collection de contrôles malgré les story cards.

Recommandations:

- Split IA: Sources et scan, Alertes, Compte et sync, Données locales.
- Ne garder dans Settings que les contrôles qui ne sont pas déjà mieux servis ailleurs.

Priorité: P1.

### Confirmation / Suppression

Evidence: `12-extension-settings-delete-confirmation.png`, `21-dashboard-data-export.png`

Intention principale: empêcher les pertes de données accidentelles.

Points forts:

- Très bon pattern: impact, après suppression, saisie explicite.
- Bouton destructif désactivé tant que le mot n'est pas saisi.
- Le dashboard répète que sessions et credentials ne sont jamais stockés.

Problèmes observés:

- L'extension et le dashboard utilisent deux variantes visuelles proches mais non identiques.
- Le dashboard export/suppression est visible dans un état connecté absent, mais l'action est disabled. C'est responsable.

Friction utilisateur:

- Faible. C'est l'un des meilleurs patterns du produit.

Recommandations:

- Standardiser un composant `DestructiveActionPanel`.
- Ajouter option "Exporter avant suppression" quand l'utilisateur est connecté.

Priorité: P3.

### Dashboard Connected

Evidence: `14-dashboard-overview.png`, `15-dashboard-mission-feed.png`, `20-dashboard-sync.png`, `25-dashboard-mobile-overview.png`

Intention principale: consolider les snapshots extension dans un cockpit web.

Points forts:

- L'état "aucune extension connectée" est très clair.
- La page répète une promesse de responsabilité: le dashboard ne lit pas les sessions plateforme.
- Mobile: la hiérarchie reste lisible.

Problèmes observés:

- Signal contradictoire: sidebar "Extension Chrome" avec point vert et 9/13 features actives alors que le cockpit dit extension absente.
- Beaucoup de CTA redondants: Installer, Se connecter, Aller à l'action, Vérifier le CV.
- Les sections vides en aval produisent beaucoup de blanc et une impression de produit incomplet.

Friction utilisateur:

- Le setup manque d'une checklist unique. L'utilisateur voit plusieurs invitations concurrentes.

Recommandations:

- Remplacer le dashboard vide par un setup wizard connecté: compte, extension, premier scan, sync.
- Aligner tous les statuts sidebar/header/story sur une seule source de vérité.

Priorité: P1.

### Reports / Export

Evidence: `21-dashboard-data-export.png`, `10-extension-settings-top.png`

Intention principale: extraire ou sauvegarder les données.

Points forts:

- Export JSON visible côté dashboard.
- Export favoris et backup local visibles côté extension.
- Messages confidentialité clairs.

Problèmes observés:

- "Rapports" n'existe pas comme vue partageable; l'export est plutôt technique.
- Pas d'aperçu avant export ni format orienté décision pour partager une shortlist.

Friction utilisateur:

- Un utilisateur qui veut communiquer ses décisions doit passer par JSON/CSV/Markdown, sans rapport prêt à lire.

Recommandations:

- Créer un "rapport mission" ou "shortlist à partager" depuis les favoris/comparaison.
- Ajouter preview, contenu inclus, confidentialité, et destination.

Priorité: P2.

### Teams and Projects

Etat actuel: aucun écran Equipes ou Projets dédié n'a été trouvé.

Recommandation:

- Ne pas créer ces vues tant que le produit reste centré freelance individuel.
- Si Pulse évolue vers collaboration, commencer par partage de shortlist et commentaires, pas par une IA de gestion de projets complète.

Priorité: P3.

## Quick Wins

1. Corriger le formulaire login pour réutiliser le layout register.
2. Corriger le statut dashboard "Extension Chrome" quand aucune extension n'est connectée.
3. Ajouter un seul CTA principal par viewport sur Feed, Dashboard vide et Settings.
4. Ajouter undo pour masquer mission, favoris, statut candidature, suppression de vue.
5. Renommer "CV synchronisé" en "CV canonique" tant que le compte n'est pas connecté.
6. Ajouter "Pourquoi ce score ?" sur MissionCard et InvestigationDrawer.
7. Remplacer les sections dashboard vides par une checklist de setup.
8. Standardiser les confirmations destructrices extension/dashboard.
9. Ajouter un aperçu de volume pour les alertes.
10. Corriger les microcopies sans accents et les mentions fournisseur inutiles dans l'auth.

## Refactors Profonds

1. Créer un modèle UX commun "Situation, Preuve, Décision, Action, Résultat" utilisé partout.
2. Refondre Settings en centre de contrôle par résultat: Sources, Alertes, Données, Compte/IA.
3. Transformer le dashboard non connecté en parcours de setup plutôt qu'en dashboard vide.
4. Simplifier CV en workflow séquentiel: profil canonique, plateformes, synchronisation.
5. Unifier extension et dashboard autour des mêmes statuts de sync et de confiance.
6. Formaliser la transparence IA: données utilisées, confiance, correction utilisateur, cache.
7. Ajouter une couche historique: scans, notifications, décisions, exports, sync conflicts.
8. Mener un audit accessibilité complet: clavier, focus, contraste, zoom, lecteur d'écran, mouvement.

## Composants à revoir

- Boutons: corriger passkey/login, clarifier les boutons ghost qui sont de vraies actions.
- Cards: réduire la répétition des story cards dans une même page.
- Tableaux: absents ou peu utilisés, ce qui est cohérent; ne pas en ajouter par défaut.
- Graphiques: TJM est lisible, mais doit aboutir à une recommandation métier.
- Sidebar: corriger le signal "Extension Chrome" dans l'état non connecté.
- Navigation: labels plus accessibles en mode dense, premium visible/verrouillé plutôt que caché.
- Modales: confirmation destructrice très bonne; standardiser entre extension et dashboard.
- Formulaires: factoriser login/register, vérifier mobile, focus et erreurs.
- Filtres: transformer en presets décisionnels.
- Recherche: bonne base, mais le dashboard vide doit expliquer comment obtenir des résultats.
- Badges: cohérents mais nombreux; limiter aux preuves nécessaires.
- Avatars: peu pertinents aujourd'hui.
- Empty states: bons côté extension, trop dispersés côté dashboard.
- Loading states: bons skeletons, mais ajouter contexte source/progression.
- Error states: bons messages, à compléter avec retry + diagnostic + contact/support si nécessaire.

## Risques Produit

- Surcharge fonctionnelle: Feed, CV, Suivi, TJM, sync, compte, IA et export se chevauchent.
- Surcharge informationnelle: trop de preuves visibles quand le statut est normal.
- Faible découvrabilité premium si les pages disparaissent.
- IA trop opaque si le score sémantique n'explique pas faits, hypothèses et confiance.
- Manque de contrôle utilisateur sans undo/historique.
- Manque de feedback long terme sur alertes et notifications.
- Dette UX dashboard dans les états vides.
- Dette craft auth, critique car elle touche la confiance compte.
- Accessibilité à confirmer au-delà des captures.

## Plan d'action recommandé

### Phase 1

Clarifier navigation, intentions d'écran et actions prioritaires.

- Corriger login.
- Corriger statuts dashboard non connecté.
- Réduire Feed à une action principale visible.
- Remplacer dashboard vide par checklist setup.
- Stabiliser le vocabulaire.

### Phase 2

Améliorer cohérence, états, accessibilité et confiance.

- Ajouter undo/historique.
- Standardiser story cards et confirmations.
- Ajouter explications score/IA.
- Refondre Settings.
- Auditer clavier, focus, zoom et lecteurs d'écran.

### Phase 3

Ajouter le niveau premium: micro-interactions, vitesse perçue, détails de finition et delight.

- Moments de succès: première mission qualifiée, première relance traitée, premier CV prêt, premier export.
- Rapport partageable depuis shortlist.
- Sync conflict resolution guidée.
- Dashboard connecté riche seulement après setup, sans surfaces vides inutiles.

## Critères d'acceptation

- Rapport markdown généré: oui.
- Chaque principe noté: oui.
- Chaque écran réellement présent analysé: oui.
- Problèmes priorisés: oui.
- Recommandations actionnables: oui.
- Quick wins séparés des refactors: oui.
- Roadmap UX/UI exploitable: oui.
- Opportunités niveau Apple, Linear, Notion Calendar et Arc Browser identifiées: oui, principalement via simplicité, contrôle, craft auth, setup dashboard, transparence IA et moments de décision.
