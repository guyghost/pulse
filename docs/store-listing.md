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

> Radar freelance : 5 plateformes, scoring IA, analyse TJM. 100% local, zéro tracking. Gratuit et open source.

---

## Description détaillée

**MissionPulse** est une extension Chrome gratuite pour les freelances tech. Elle centralise les missions de 5 plateformes dans un panneau latéral unique avec scoring de pertinence par IA.

### Fonctionnalités

- **Feed centralisé** — Regroupe les missions de Free-Work, LeHibou, Hiway, Collective et Cherry Pick dans une seule interface.
- **Scoring IA** — Chaque mission reçoit un score basé sur vos compétences, TJM, localisation, séniorité et préférences remote. Gemini Nano (IA locale Chrome) affine le score sémantiquement.
- **Bonus urgence** — Les missions avec une date de début proche sont mises en avant automatiquement.
- **Dashboard TJM** — Historique et tendances du taux journalier par stack et par source. Négociez avec des données.
- **Déduplication intelligente** — Détecte et fusionne les missions publiées sur plusieurs plateformes simultanément.
- **Smart notifications** — Configurez vos critères (stack + TJM + score minimum) pour ne recevoir que les alertes pertinentes.
- **Comparaison** — Sélectionnez jusqu'à 3 missions et comparez-les côte à côte (TJM, stack, remote, durée).
- **Scan parallèle** — 5 connecteurs lancés simultanément pour un scan complet en moins de 30 secondes.
- **Export** — Exportez vos missions en JSON, CSV ou Markdown, avec filtres appliqués.
- **100% local** — Aucun serveur, aucun tracking, aucune collecte de données. Tout reste sur votre machine.

### Plateformes connectées

- Free-Work (8 000+ missions)
- LeHibou (missions IT grands comptes)
- Hiway (portage salarial + missions)
- Collective (collectif de freelances)
- Cherry Pick (missions tech sélectionnées)

### Comment ça marche

1. **Installez** l'extension depuis le Chrome Web Store.
2. **Configurez** votre profil : compétences, TJM cible, localisation, séniorité et préférences.
3. **Connectez-vous** aux plateformes supportées dans votre navigateur (sessions existantes).
4. **Ouvrez le panneau latéral** — MissionPulse scanne les plateformes et affiche les missions triées par pertinence.

### Compatibilité

Fonctionne sur Chrome, Brave, Edge, Arc et Dia.

### Vie privée

MissionPulse ne s'appuie sur aucun serveur externe. Le profil, les missions, les favoris, les caches et l'historique TJM restent stockés localement via IndexedDB et chrome.storage. Le scoring IA utilise Gemini Nano qui tourne entièrement sur votre machine, sans clé API externe. Code source ouvert sur GitHub.

---

## Assets Chrome Web Store

| Asset | Fichier | Taille |
|---|---|---|
| Screenshot 1 — Feed | `store-assets/screenshot-1-feed.png` | 1280×800 |
| Screenshot 2 — TJM | `store-assets/screenshot-2-tjm.png` | 1280×800 |
| Screenshot 3 — Privacy | `store-assets/screenshot-3-privacy.png` | 1280×800 |
| Promo tile | `store-assets/promo-tile-440x280.png` | 440×280 |
| Icône 128px | `static/icons/icon-128.png` | 128×128 |

---

## Permissions justifiées

| Permission | Justification |
|---|---|
| `sidePanel` | Interface utilisateur dans le panneau latéral Chrome |
| `storage` | Stockage local du profil, paramètres et cache |
| `cookies` | Détection de session sur les plateformes (LeHibou, Collective, Cherry Pick) |
| `alarms` | Scan automatique programmé en arrière-plan |
| `notifications` | Alertes pour les missions à haut score |
| `declarativeNetRequest` | Réécriture headers Origin/Referer pour les API cross-origin |
| `host_permissions` | Accès aux 5 plateformes pour le scraping de missions |
