# Product

## Register

product

## Users

Freelances tech (développeurs, designers, DevOps, etc.) en France/Europe qui chassent des missions sur plusieurs plateformes (Free-Work, LeHibou, Hiway, Collective, Cherry Pick) et doivent décider rapidement lesquelles méritent une candidature. Ils travaillent sur ordinateur portable, souvent dans des fenêtres de focus courtes entre deux contrats ou en veille en arrière-plan pendant les temps morts.

Le job à faire : faire émerger les missions à plus fort signal du bruit de cinq job boards qui se chevauchent, scorer chaque mission selon l'adéquation au profil (stack, TJM, remote, séniorité, urgence), et agir — sans subir le clutter et la charge cognitive des marketplaces sources.

## Product Purpose

MissionPulse est une extension Chrome 100% locale qui agrège les missions freelance de cinq plateformes en un feed scoré unique, avec l'analyse de tendance TJM et des notifications intelligentes. Elle existe parce que les plateformes sources sont bruyantes, inconsistantes, et forcent à jongler entre onglets. Le succès : un freelance ouvre le panneau, scanne un feed dédupliqué et ranké en moins d'une minute, et qualifie (retient ou écarte) chaque mission en confiance. Le design sert le produit — la valeur est le signal, pas le chrome.

La réussite se mesure par une recherche plus rapide, une qualification plus simple, et moins d'opportunités ratées.

## Brand Personality

Calme, précis, fiable. L'énergie d'un terminal Bloomberg pour freelances : information dense rendue lisible, aucun bruit décoratif, la confiance par la clarté. La voix est simple et directe ; le ton est neutre-professionnel, jamais clinquant. Personnalité en trois mots : **précis, calme, fiable**. Objectif émotionnel : « Je peux faire confiance à ce que l'outil remonte, et j'agis vite. »

Direction de référence : la clarté et la sobriété fonctionnelle perçue dans Apple, Notion et Linear, appliquées à un workflow freelance.

## Anti-references

- **Job boards / marketplaces clutterés** — Malt, Free-Work, et les autres plateformes sources que le produit agrège. Leurs tells : densité mur de cartes, badges et CTA en compétition, typographie inconsistante, sidebars chargées, absence de hiérarchie. MissionPulse doit se lire comme l'*antidote*, pas comme une copie plus soignée.
- **Dashboards SaaS génériques** — navy + grilles de cartes + accents en gradient, le look « outil entreprise » par défaut qui ne signale rien.
- Motion décoratif, glassmorphism, et gradient text comme substituts de polish.
- Dashboards SaaS flashy ou sur-décorés, gradients décoratifs, effets visuels gratuits, et interfaces bruyantes qui distraient du tri.
- Multiplication d'éléments de chrome UI qui ralentissent la décision.

## Design Principles

1. **Signal sur bruit.** Chaque pixel classe, clarifie ou rend une décision possible. Sinon, il n'est pas à l'écran. Aller au signal utile en premier : rendre les missions prioritaires visibles sans surcharge.
2. **Dense mais lisible.** Comme un terminal : packer l'information, mais utiliser typo, espacement et contraste pour la garder scannable. Densité sans chaos.
3. **Décision en une passe.** Un utilisateur doit pouvoir trier le feed en un seul scan — score, stack, TJM et statut remote visibles sans déplier ni cliquer.
4. **Confiance par la transparence.** Montrer *pourquoi* une mission a son score. Le score n'est fiable que si son décomposition l'est. Afficher la fiabilité opérationnelle : états clairs, feedback immédiat, ambiguïté minimale.
5. **Calme confiant.** Pas de théâtre d'urgence, pas d'animation célébratoire. Les outils confiants ne crient pas. Préserver la continuité de workflow : transitions et navigation au service de la productivité.

## Accessibility & Inclusion

- Conformité cible : **WCAG 2.1 AA minimum** (texte de body ≥ 4.5:1, texte large ≥ 3:1).
- Respect systématique de la lisibilité (contrastes conformes), de la navigation clavier et des focus visibles.
- Reduced motion respecté partout (le registre terminal/calme penche déjà vers un motion minimal) ; alternatives reduced motion pour les utilisateurs sensibles aux animations.
- La navigation clavier-first est une feature affichée (raccourcis) ; toutes les actions primaires doivent être atteignables sans souris.
- La couleur n'est jamais le seul porteur de sens (le statut du score a besoin de redondance label/icône, pas seulement de teinte).
- UI en français ; le copy reste clair et direct, on évite le jargon là où le langage simple suffit.
