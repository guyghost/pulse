# Chrome Web Store — Fiche de publication

---

## Informations générales

- **Nom** : MissionPulse
- **Catégorie** : Productivity
- **Langue** : Français
- **Site web** : https://missionpulse.app
- **GitHub** : https://github.com/guyghost/pulse

---

## Résumé court (132 caractères max)

> Radar freelance tech : 4 plateformes, 1 feed scoré, dashboard connecté optionnel. Exécution navigateur.

---

## Description détaillée

**MissionPulse** est une extension Chrome gratuite pour les freelances tech français. Elle centralise les missions de Free-Work, LeHibou, Hiway et Cherry Pick dans un panneau latéral unique, score les meilleures opportunités et aide à transformer la veille en pipeline de candidatures.

Pensé pour les développeurs freelances 3+ ans, TJM 450-900€, qui surveillent des requêtes comme `missions freelance Java`, `mission freelance Spring Boot`, `TJM développeur freelance` ou `Free-Work LeHibou alternative`.

### Fonctionnalités

- **Feed centralisé** — Regroupe les missions de Free-Work, LeHibou, Hiway et Cherry Pick dans une seule interface.
- **Scoring IA** — Chaque mission reçoit un score basé sur vos compétences, TJM, localisation, séniorité et préférences remote. Gemini Nano (IA locale Chrome) affine le score sémantiquement.
- **Shortlist actionnable** — Les missions 80+ compatibles avec votre stack, votre TJM et votre remote remontent avant le bruit.
- **Bonus urgence** — Les missions avec une date de début proche sont mises en avant automatiquement.
- **Dashboard TJM** — Historique et tendances du taux journalier par stack et par source. Négociez avec des données.
- **Déduplication intelligente** — Détecte et fusionne les missions publiées sur plusieurs plateformes simultanément.
- **Smart notifications** — Configurez vos critères (stack + TJM + score minimum) pour ne recevoir que les alertes pertinentes.
- **Comparaison** — Sélectionnez jusqu'à 3 missions et comparez-les côte à côte (TJM, stack, remote, durée).
- **Scan parallèle** — 4 connecteurs lancés simultanément pour un scan complet en moins de 30 secondes.
- **Export** — Exportez vos missions en JSON, CSV ou Markdown, avec filtres appliqués.
- **Dashboard connecté optionnel** — L'exécution plateforme reste dans votre navigateur; les snapshots normalisés peuvent être synchronisés via Supabase pour retrouver missions, candidatures et CV canonique dans le dashboard.

### Plateformes connectées

- Free-Work (8 000+ missions)
- LeHibou (missions IT grands comptes)
- Hiway (portage salarial + missions)
- Cherry Pick (missions tech sélectionnées)

### Comment ça marche

1. **Installez** l'extension depuis le Chrome Web Store.
2. **Configurez** votre profil : compétences, TJM cible, localisation, séniorité et préférences.
3. **Connectez-vous** aux plateformes supportées dans votre navigateur (sessions existantes).
4. **Ouvrez le panneau latéral** — MissionPulse scanne les plateformes et affiche les missions triées par pertinence.
5. **Connectez le dashboard si besoin** — Un compte MissionPulse permet de synchroniser missions, pipeline de candidature, assets générés et CV canonique.

### Compatibilité

Fonctionne sur Chrome, Brave, Edge, Arc et Dia.

### Vie privée

L'exécution plateforme reste locale dans votre navigateur et MissionPulse ne stocke jamais vos identifiants de plateformes. Le mode dashboard connecté synchronise uniquement des snapshots normalisés via Supabase: missions, scores, pipeline de candidature, assets générés et CV canonique. Nous ne synchronisons pas les mots de passe, cookies, jetons de session, ni le HTML brut LinkedIn. Le scoring IA utilise Gemini Nano sur votre machine quand il est disponible. Code source ouvert sur GitHub.

---

## Assets Chrome Web Store

| Asset                  | Fichier                                 | Taille   |
| ---------------------- | --------------------------------------- | -------- |
| Screenshot 1 — Feed    | `store-assets/screenshot-1-feed.png`    | 1280×800 |
| Screenshot 2 — TJM     | `store-assets/screenshot-2-tjm.png`     | 1280×800 |
| Screenshot 3 — Privacy | `store-assets/screenshot-3-privacy.png` | 1280×800 |
| Promo tile             | `store-assets/promo-tile-440x280.png`   | 440×280  |
| Icône 128px            | `static/icons/icon-128.png`             | 128×128  |

---

## Permissions justifiées

| Permission                  | Justification                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `sidePanel`                 | Interface utilisateur dans le panneau latéral Chrome                                                   |
| `storage`                   | Stockage local du profil, paramètres et cache                                                          |
| `cookies`                   | Détection de session sur les plateformes (LeHibou et Cherry Pick)                                      |
| `alarms`                    | Scan automatique programmé en arrière-plan                                                             |
| `notifications`             | Alertes pour les missions à haut score                                                                 |
| `declarativeNetRequest`     | Réécriture headers Origin/Referer pour les API cross-origin                                            |
| `scripting`                 | Extraction DOM du profil LinkedIn après autorisation explicite                                         |
| `activeTab`                 | Limite l'import LinkedIn à l'onglet actif choisi par l'utilisateur                                     |
| `host_permissions`          | Accès aux 4 plateformes pour le scraping de missions                                                   |
| `optional_host_permissions` | `https://www.linkedin.com/*`, demandé uniquement pendant le geste utilisateur d'import du profil actif |
