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

> Radar freelance tech : 4 plateformes, 1 feed scoré, exécution navigateur. Local-first.

---

## Description détaillée

**MissionPulse** est une extension Chrome gratuite pour les freelances tech
français. Elle centralise les missions de Free-Work, LeHibou, Hiway et Cherry
Pick dans un panneau latéral unique, explique les meilleures opportunités et
vous laisse décider quoi ouvrir.

Pensé pour les freelances tech, France & remote, qui surveillent des requêtes comme `missions freelance Java`, `mission freelance Spring Boot`, `TJM développeur freelance` ou `Free-Work LeHibou alternative`.

### Fonctionnalités

- **Feed centralisé gratuit** — Regroupe les missions de Free-Work, LeHibou,
  Hiway et Cherry Pick dans une seule interface.
- **Scoring déterministe et explicable** — Chaque mission reçoit un score basé sur vos compétences, TJM, localisation, séniorité et préférences remote.
- **Score sémantique local optionnel** — Quand Gemini Nano est disponible dans Chrome, il affine le score sémantiquement sur votre machine. Le scoring de base reste déterministe et fonctionnel sans IA.
- **Shortlist actionnable** — Les missions 80+ compatibles avec votre stack, votre TJM et votre remote remontent avant le bruit.
- **Bonus urgence** — Les missions avec une date de début proche sont mises en avant automatiquement.
- **Radar TJM** — Historique et tendances du taux journalier par stack et par source. Négociez avec des données locales.
- **Déduplication intelligente** — Détecte et fusionne les missions publiées sur plusieurs plateformes simultanément.
- **Smart notifications** — Configurez vos critères (stack + TJM + score minimum) pour ne recevoir que les alertes pertinentes.
- **Comparaison** — Sélectionnez jusqu'à 3 missions et comparez-les côte à côte (TJM, stack, remote, durée).
- **Profil et CV locaux** — Gardez votre stack, votre TJM cible, vos préférences remote et vos expériences dans l’extension.
- **Scan parallèle** — 4 connecteurs distribués par défaut, exécutés avec un
  pool borné.
- **Export** — Exportez vos missions en JSON, CSV ou Markdown, avec filtres appliqués.
- **Favoris, masquage et offline** — Retenez ce qui compte, réduisez le bruit et relisez vos données sans connexion.

### Plateformes sources

- Free-Work
- LeHibou
- Hiway
- Cherry Pick

### Comment ça marche

1. **Installez** l'extension depuis le Chrome Web Store.
2. **Configurez** votre profil : compétences, TJM cible, localisation, séniorité et préférences.
3. **Gardez vos sessions plateforme** dans votre navigateur ; MissionPulse les réutilise localement.
4. **Ouvrez le panneau latéral** — MissionPulse scanne les plateformes et affiche les missions triées par pertinence.

### Compatibilité

Fonctionne sur Chrome, Brave, Edge, Arc et Dia.

### Vie privée

L'exécution plateforme reste locale dans votre navigateur et MissionPulse ne
stocke jamais vos identifiants de plateformes. Cette version fonctionne sans
compte MissionPulse : elle n'expose ni dashboard, ni synchronisation, ni
crédits, ni paiement. Les données produit restent dans les stockages locaux de
l'extension. Nous n'envoyons ni mots de passe, ni cookies, ni jetons de session
des plateformes. Gemini Nano s'exécute sur votre machine quand il est disponible
; sans cette IA locale, le scoring déterministe continue de fonctionner. Code
source ouvert sur GitHub.

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
