# Chrome Web Store — Fiche de publication

Version de référence : **0.2.4**, build scellé au commit `fff1872c9d1544abc5e3c6d2957fd17ef8a0f028`
(GitHub Release `v0.2.4`). Toute affirmation ci-dessous décrit le `manifest.json` et le bundle
réellement livrés dans `missionpulse.zip`, pas le manifest source complet. Le brouillon des
réponses au questionnaire de confidentialité du dashboard CWS est dans
[`cws-privacy-questionnaire.md`](./cws-privacy-questionnaire.md).

---

## Informations générales

- **Nom** : MissionPulse
- **Catégorie** : Productivity
- **Langue** : Français
- **Site web** : https://missionpulse.app
- **Politique de confidentialité** : https://missionpulse.app/privacy
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
- **Classification cloud optionnelle (clé personnelle)** — Si vous saisissez votre propre clé Vercel AI Gateway dans les paramètres, les nouvelles missions peuvent être catégorisées par ce service. Sans clé, rien n'est envoyé.
- **Shortlist actionnable** — Les missions 80+ compatibles avec votre stack, votre TJM et votre remote remontent avant le bruit.
- **Bonus urgence** — Les missions avec une date de début proche sont mises en avant automatiquement.
- **Radar TJM** — Historique et tendances du taux journalier par stack et par source. Négociez avec des données locales.
- **Déduplication intelligente** — Détecte et fusionne les missions publiées sur plusieurs plateformes simultanément.
- **Smart notifications** — Configurez vos critères (stack + TJM + score minimum) pour ne recevoir que les alertes pertinentes.
- **Comparaison** — Sélectionnez jusqu'à 3 missions et comparez-les côte à côte (TJM, stack, remote, durée).
- **Profil et CV locaux** — Gardez votre stack, votre TJM cible, vos préférences remote et vos expériences dans l’extension. Import LinkedIn optionnel, déclenché par vous.
- **Assistant de formulaire local (désactivé par défaut)** — Sur les formulaires de candidature des plateformes supportées, propose une valeur issue de votre profil, générée sur votre machine ; rien n'est inséré sans votre validation et le formulaire n'est jamais soumis à votre place.
- **Scan parallèle** — 4 connecteurs distribués par défaut, exécutés avec un
  pool borné.
- **Export** — Exportez vos missions en JSON, CSV ou Markdown, avec filtres appliqués.
- **Favoris, masquage et offline** — Retenez ce qui compte, réduisez le bruit et relisez vos données sans connexion.

### Plateformes sources

Ce build interroge exactement 4 plateformes :

- Free-Work (`www.free-work.com`)
- LeHibou (`*.lehibou.com`)
- Hiway (`hiway-missions.fr`, dont les missions sont servies par l'API Supabase publique de Hiway)
- Cherry Pick (`app.cherry-pick.io`)

### Comment ça marche

1. **Installez** l'extension depuis le Chrome Web Store.
2. **Configurez** votre profil : compétences, TJM cible, localisation, séniorité et préférences.
3. **Gardez vos sessions plateforme** dans votre navigateur ; MissionPulse les réutilise localement.
4. **Ouvrez le panneau latéral** — MissionPulse scanne les plateformes et affiche les missions triées par pertinence.

### Compatibilité

Fonctionne sur Chrome, Brave, Edge, Arc et Dia.

### Vie privée

Cette version fonctionne sans compte MissionPulse : elle n'expose ni
synchronisation, ni crédits, ni paiement, et n'envoie aucune donnée à un
serveur MissionPulse. Votre profil, votre CV, les missions et l'historique TJM
restent dans les stockages locaux de l'extension.

L'extension contacte directement depuis votre navigateur les 4 plateformes
ci-dessus pour lire leurs missions, avec vos mots-clés de recherche. Pour
LeHibou, elle lit votre cookie de session LeHibou et le joint uniquement aux
requêtes envoyées à LeHibou (pour Cherry Pick, le navigateur joint vos cookies
Cherry Pick aux seules requêtes vers Cherry Pick) ; aucun mot de passe, cookie ou jeton de session
n'est transmis à MissionPulse ni à un autre service. MissionPulse ne stocke
jamais vos identifiants de plateformes.

Gemini Nano s'exécute sur votre machine quand il est disponible ; sans cette
IA locale, le scoring déterministe continue de fonctionner. Seul traitement
IA hors de votre machine, et uniquement si vous saisissez votre propre clé Vercel
AI Gateway : le titre, les technologies, le mode de travail et la description
(tronqués) des nouvelles missions sont envoyés à Vercel AI Gateway pour
classification, avec la conservation des données désactivée dans la requête.
Votre profil n'est pas envoyé. Aucun outil d'analytics ni de télémétrie. Code
source ouvert sur GitHub.

---

## Éléments de langage (comms)

À utiliser tels quels sur la landing, les réseaux et le support, pour rester
aligné avec le build 0.2.4 :

- « 4 plateformes : Free-Work, LeHibou, Hiway, Cherry Pick. »
- « Exécution dans votre navigateur, sans compte MissionPulse. »
- « Aucune donnée envoyée à MissionPulse. Classification cloud uniquement avec votre propre clé Vercel AI Gateway. »
- « Gemini Nano local quand Chrome le propose ; sinon scoring déterministe. »
- À ne pas promettre pour 0.2.4 : compte, synchronisation, Copilot, génération de candidature
  côté serveur, autres plateformes que les 4 ci-dessus, « 100 % hors ligne ».

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

Statut : **défaut** = utilisé sans action particulière de l'utilisateur ; **opt-in** = seulement
après une action ou un réglage explicite ; **inactif** = déclaré dans le manifest 0.2.4 mais
aucun chemin du build ne l'atteint (voir « Risques de revue » plus bas).

| Permission              | Statut  | Justification                                                                                                                                                                                                                 |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidePanel`             | défaut  | Toute l'interface (feed, profil, CV, candidatures, TJM, paramètres) vit dans le panneau latéral Chrome.                                                                                                                       |
| `storage`               | défaut  | Stockage local (`chrome.storage.local`) des paramètres, favoris, caches et de la clé AI Gateway facultative ; jamais synchronisé.                                                                                             |
| `cookies`               | défaut  | LeHibou : détecter la présence du cookie de session `rt` et joindre les cookies LeHibou aux seules requêtes vers l'API LeHibou. LinkedIn (opt-in) : vérifier la présence du cookie `li_at` avant l'import du profil.          |
| `alarms`                | défaut  | Scan automatique périodique, digest quotidien et sondes de santé des connecteurs.                                                                                                                                             |
| `notifications`         | défaut  | Alertes pour les missions à haut score, digest quotidien et suggestion d'activer le scan automatique.                                                                                                                         |
| `declarativeNetRequest` | défaut  | Règles dynamiques limitées aux domaines des plateformes : en-têtes `Origin`/`Referer` pour Free-Work et LeHibou, en-tête `Cookie` LeHibou pour les requêtes XHR de l'extension vers LeHibou. Aucune règle sur d'autres sites. |
| `scripting`             | opt-in  | Extraction DOM du profil LinkedIn dans l'onglet actif, après autorisation explicite et geste utilisateur.                                                                                                                     |
| `activeTab`             | opt-in  | Limite l'import LinkedIn à l'onglet actif choisi par l'utilisateur.                                                                                                                                                           |
| `identity`              | inactif | Prévu pour la connexion du Copilot au compte MissionPulse via `chrome.identity.launchWebAuthFlow`. Le Copilot est désactivé à la compilation dans 0.2.4 et son panneau n'est pas affiché : aucun appel n'est possible.        |

### Hosts (`host_permissions`, manifest livré)

| Host                                         | Statut  | Justification                                                                                                                                             |
| -------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://www.free-work.com/*`                | défaut  | Lecture des missions Free-Work (API publique, sans cookies) ; script de contenu de l'assistant de formulaire.                                             |
| `https://*.lehibou.com/*`                    | défaut  | Lecture des missions LeHibou avec la session LeHibou de l'utilisateur ; script de contenu de l'assistant de formulaire.                                   |
| `https://hiway-missions.fr/*`                | défaut  | Plateforme Hiway ; script de contenu de l'assistant de formulaire.                                                                                        |
| `https://jhgjtlkfewuiiofxfrvh.supabase.co/*` | défaut  | API REST Supabase **appartenant à Hiway** (clé anonyme publique du site Hiway) d'où proviennent les missions Hiway. Ce n'est pas un backend MissionPulse. |
| `https://app.cherry-pick.io/*`               | défaut  | Lecture des missions Cherry Pick ; script de contenu de l'assistant de formulaire.                                                                        |
| `https://ai-gateway.vercel.sh/*`             | opt-in  | Classification des missions par Vercel AI Gateway, uniquement si l'utilisateur enregistre sa propre clé.                                                  |
| `https://ai-gateway.vercel.app/*`            | inactif | Domaine alternatif de Vercel AI Gateway ; le bundle 0.2.4 ne l'appelle jamais (le SDK utilise `ai-gateway.vercel.sh`).                                    |
| `https://copilot.missionpulse.app/*`         | inactif | API du Copilot (domaine sans cookie). Désactivé à la compilation dans 0.2.4 : aucun appel.                                                                |

| Permission optionnelle      | Statut | Justification                                                                                          |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `optional_host_permissions` | opt-in | `https://www.linkedin.com/*`, demandé uniquement pendant le geste utilisateur d'import du profil actif |

Le script de contenu (`content_scripts`) est injecté sur les 4 plateformes (et, par construction,
sur le host Supabase de Hiway). Il reste inerte tant que l'assistant de formulaire n'est pas activé
dans les paramètres (désactivé par défaut).

### Risques de revue identifiés pour 0.2.4

- `identity`, `https://copilot.missionpulse.app/*` et `https://ai-gateway.vercel.app/*` sont
  déclarés mais inatteignables dans ce build. La politique CWS demande les permissions les plus
  étroites possibles : la revue peut les refuser. Les retirer exige un changement du manifest,
  donc une nouvelle version, un nouveau seal et un nouveau package.
- Le script de contenu correspond aussi à `https://jhgjtlkfewuiiofxfrvh.supabase.co/*`, un host
  d'API sans formulaire.
