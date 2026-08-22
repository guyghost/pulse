# Product

<!-- impeccable:product-schema 1 -->

## Platform

web — extension Chrome (Manifest V3) : side panel HTML/CSS/JS, pas d'app native.

## Users

Freelances tech (développeurs, designers, DevOps, etc.) en France/Europe qui chassent des missions sur plusieurs plateformes (Free-Work, LeHibou, Hiway, Collective, Cherry Pick, Malt) et doivent décider rapidement lesquelles méritent une candidature. Ils travaillent sur ordinateur portable, souvent dans des fenêtres de focus courtes entre deux contrats ou en veille en arrière-plan pendant les temps morts.

Le job à faire : faire émerger les missions à plus fort signal du bruit de six job boards qui se chevauchent, scorer chaque mission selon l'adéquation au profil (stack, TJM, remote, séniorité, urgence), et agir — sans subir le clutter et la charge cognitive des marketplaces sources.

## Product Purpose

MissionPulse est une extension Chrome local-first qui agrège les missions freelance de six plateformes en un feed scoré unique, avec l'analyse de tendance TJM et des notifications intelligentes. Elle existe parce que les plateformes sources sont bruyantes, inconsistantes, et forcent à jongler entre onglets. Le succès : un freelance ouvre le panneau, scanne un feed dédupliqué et ranké en moins d'une minute, et qualifie (retient ou écarte) chaque mission en confiance. Le design sert le produit — la valeur est le signal, pas le chrome.

La réussite se mesure par une recherche plus rapide, une qualification plus simple, et moins d'opportunités ratées.

## Positioning

Le différenciateur qu'un concurrent ne peut pas copier aisément : **le noyau est 100% local-first**. MissionPulse utilise les sessions navigateur existantes de l'utilisateur — scraping, déduplication, scoring et stockage vivent entièrement dans le navigateur (IndexedDB + chrome.storage), sans compte requis, sans credentials de plateforme stockés, zéro télémétrie. Un mode connecté optionnel existe (appairage opt-in avec le dashboard missionpulse.app pour les entitlements premium), mais il n'est jamais requis : l'extension fonctionne intégralement sans compte ni backend. Là où un agrégateur classique déporte les données côté serveur, MissionPulse calcule tout localement : déduplication et scoring cross-plateformes, tendance TJM, et scoring sémantique optionnel via Gemini Nano (IA on-device). C'est l'antidote local aux marketplaces, pas un énième job board.

## Operating Context

- Side panel Chrome, ouvert à côté des onglets de travail ; fenêtres de focus courtes — le feed doit se scanner en moins d'une minute.
- Les sessions plateformes vivent dans les onglets et cookies du navigateur existant ; si l'utilisateur n'est pas connecté à une plateforme, ce connecteur échoue proprement sans casser les autres.
- Scan cyclique en arrière-plan (service worker MV3, `chrome.alarms`) avec notifications pour les missions à haut score ; usage desktop, souvent en veille pendant les temps morts.

## Capabilities and Constraints

- 6 connecteurs plateformes (Free-Work, LeHibou, Hiway, Collective, Cherry Pick, Malt) : parsers purs testables, connecteurs I/O dans le shell ; un DOM source qui change produit une `ConnectorError` typée et les autres connecteurs continuent.
- Local-first : IndexedDB + `chrome.storage` ; aucun compte requis, aucun credential de plateforme stocké, zéro télémétrie. Mode connecté optionnel (appairage dashboard via deviceSecret local, entitlements premium) — opt-in, jamais requis pour le fonctionnement local.
- Scoring déterministe local (relevance) + scoring sémantique optionnel via Gemini Nano avec cache 7 jours, non-bloquant s'il est indisponible.
- Contraintes MV3 : service worker non persistant, pas d'API payante, pas de scraping côté serveur.

## Brand Personality

Calme, précis, fiable. L'énergie d'un terminal Bloomberg pour freelances : information dense rendue lisible, aucun bruit décoratif, la confiance par la clarté. La voix est simple et directe ; le ton est neutre-professionnel, jamais clinquant. Personnalité en trois mots : **précis, calme, fiable**. Objectif émotionnel : « Je peux faire confiance à ce que l'outil remonte, et j'agis vite. »

Direction de référence : la clarté et la sobriété fonctionnelle perçue dans Apple, Notion et Linear, appliquées à un workflow freelance.

## Anti-references

- **Job boards / marketplaces clutterés** — Malt, Free-Work, et les autres plateformes sources que le produit agrège. Leurs tells : densité mur de cartes, badges et CTA en compétition, typographie inconsistante, sidebars chargées, absence de hiérarchie. MissionPulse doit se lire comme l'_antidote_, pas comme une copie plus soignée.
- **Dashboards SaaS génériques** — navy + grilles de cartes + accents en gradient, le look « outil entreprise » par défaut qui ne signale rien.
- Motion décoratif, glassmorphism, et gradient text comme substituts de polish.
- Dashboards SaaS flashy ou sur-décorés, gradients décoratifs, effets visuels gratuits, et interfaces bruyantes qui distraient du tri.
- Multiplication d'éléments de chrome UI qui ralentissent la décision.

## Evidence on Hand

Absences à ce jour — les travaux futurs ne doivent rien inventer sur ces points :

- Pas d'utilisateurs externes mesurés, pas de données d'usage réelles, pas de témoignages, pas de couverture presse.
- Preuves disponibles : le repo lui-même (code, tests unitaires et régression golden des parsers, fixtures de pages scrapées) et la landing missionpulse.app.

## Product Principles

1. **Signal sur bruit.** Chaque pixel classe, clarifie ou rend une décision possible. Sinon, il n'est pas à l'écran. Aller au signal utile en premier : rendre les missions prioritaires visibles sans surcharge.
2. **Dense mais lisible.** Comme un terminal : packer l'information, mais utiliser typo, espacement et contraste pour la garder scannable. Densité sans chaos.
3. **Décision en une passe.** Un utilisateur doit pouvoir trier le feed en un seul scan — score, stack, TJM et statut remote visibles sans déplier ni cliquer.
4. **Confiance par la transparence.** Montrer _pourquoi_ une mission a son score. Le score n'est fiable que si son décomposition l'est. Afficher la fiabilité opérationnelle : états clairs, feedback immédiat, ambiguïté minimale.
5. **Calme confiant.** Pas de théâtre d'urgence, pas d'animation célébratoire. Les outils confiants ne crient pas. Préserver la continuité de workflow : transitions et navigation au service de la productivité.

## Accessibility & Inclusion

- Conformité cible : **WCAG 2.1 AA minimum** (texte de body ≥ 4.5:1, texte large ≥ 3:1).
- Respect systématique de la lisibilité (contrastes conformes), de la navigation clavier et des focus visibles.
- Reduced motion respecté partout (le registre terminal/calme penche déjà vers un motion minimal) ; alternatives reduced motion pour les utilisateurs sensibles aux animations.
- La navigation clavier-first est une feature affichée (raccourcis) ; toutes les actions primaires doivent être atteignables sans souris.
- La couleur n'est jamais le seul porteur de sens (le statut du score a besoin de redondance label/icône, pas seulement de teinte).
- UI en français ; le copy reste clair et direct, on évite le jargon là où le langage simple suffit.
