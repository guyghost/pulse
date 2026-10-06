# Chrome Web Store — Fiche de publication

Version de référence : **0.2.5**, build scellé au commit `5eb7ab830a75a459aba8f02b1b22208706a5998e`
(GitHub Release `v0.2.5`, `missionpulse.zip` SHA-256 `5e2c5321f9c799444851d5a90869ebda4814fd55823b543ada6c1a54767754f3`). Toute affirmation ci-dessous décrit le `manifest.json` et le bundle
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
- **Classification cloud optionnelle (clé personnelle)** — Si vous saisissez votre propre clé Vercel AI Gateway dans les paramètres, les missions enregistrées non encore classées peuvent être catégorisées par ce service. Sans clé, rien n'est envoyé.
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
ci-dessus pour lire leurs missions, avec vos mots-clés de recherche. Pour LeHibou, elle ne lit que les cookies que votre navigateur enverrait lui-même à l'adresse de l'API LeHibou qui liste les missions (domaine, chemin et attribut Secure respectés) et les joint à cette seule requête, via une règle réseau temporaire supprimée après la requête (pour Cherry Pick, le navigateur joint vos cookies
Cherry Pick aux seules requêtes vers Cherry Pick) ; aucun mot de passe, cookie ou jeton de session
n'est transmis à MissionPulse ni à un autre service. MissionPulse ne stocke
jamais vos identifiants de plateformes.

Gemini Nano s'exécute sur votre machine quand il est disponible ; sans cette
IA locale, le scoring déterministe continue de fonctionner. Seul traitement
IA hors de votre machine, et uniquement si vous saisissez votre propre clé Vercel
AI Gateway : le titre (200 caractères max), les technologies, le mode de travail et la description (1 500 caractères max) des missions enregistrées pas encore classées (25 par scan par défaut) sont envoyés à Vercel AI Gateway pour classification, avec la conservation des données désactivée dans la requête.
Votre profil n'est pas envoyé. Aucun outil d'analytics ni de télémétrie. Code
source ouvert sur GitHub.

---

## Éléments de langage (comms)

À utiliser tels quels sur la landing, les réseaux et le support, pour rester
aligné avec le build 0.2.5 :

- « 4 plateformes : Free-Work, LeHibou, Hiway, Cherry Pick. »
- « Exécution dans votre navigateur, sans compte MissionPulse. »
- « Aucune donnée envoyée à MissionPulse. Classification cloud uniquement avec votre propre clé Vercel AI Gateway. »
- « Gemini Nano local quand Chrome le propose ; sinon scoring déterministe. »
- À ne pas promettre pour 0.2.5 : compte, synchronisation, Copilot, génération de candidature
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
après une action ou un réglage explicite. Le manifest 0.2.5 ne déclare plus `activeTab` ni
`identity`, ni les hosts `copilot.missionpulse.app` et `ai-gateway.vercel.app` (présents, sans
usage, dans 0.2.4).

| Permission              | Statut | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidePanel`             | défaut | Toute l'interface (feed, profil, CV, candidatures, TJM, paramètres) vit dans le panneau latéral Chrome.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `storage`               | défaut | Stockage local (`chrome.storage.local`) des paramètres, favoris, caches et de la clé AI Gateway facultative ; jamais synchronisé.                                                                                                                                                                                                                                                                                                                                                                                                |
| `cookies`               | défaut | LeHibou : détecter la présence du cookie de session `rt`, puis joindre à la seule requête de liste des missions (`https://api.lehibou.com/api/search/mission/list`) les cookies que le navigateur enverrait lui-même à cette URL (portée domaine, chemin et `Secure` respectée, RFC 6265) ; en-tête placé temporairement dans une règle DNR dynamique limitée à cet endpoint, supprimée après la requête et au démarrage du service worker. LinkedIn (opt-in) : vérifier la présence du cookie `li_at` avant l'import du profil. |
| `alarms`                | défaut | Scan automatique périodique, digest quotidien et sondes de santé des connecteurs.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `notifications`         | défaut | Alertes pour les missions à haut score, digest quotidien et suggestion d'activer le scan automatique.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `declarativeNetRequest` | défaut | Règles dynamiques limitées aux domaines des plateformes : en-têtes `Origin`/`Referer` pour Free-Work et LeHibou, en-tête `Cookie` LeHibou pour la seule requête de liste des missions vers `api.lehibou.com`. Aucune règle sur d'autres sites.                                                                                                                                                                                                                                                                                   |
| `scripting`             | opt-in | Extraction DOM du profil LinkedIn dans les onglets LinkedIn du profil, après autorisation explicite (permission optionnelle LinkedIn) et geste utilisateur.                                                                                                                                                                                                                                                                                                                                                                      |

### Hosts (`host_permissions`, manifest livré)

| Host                                         | Statut | Justification                                                                                                                                                                                      |
| -------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://www.free-work.com/*`                | défaut | Lecture des missions Free-Work (API publique, sans cookies) ; script de contenu de l'assistant de formulaire.                                                                                      |
| `https://*.lehibou.com/*`                    | défaut | Lecture des missions LeHibou avec la session LeHibou de l'utilisateur ; script de contenu de l'assistant de formulaire.                                                                            |
| `https://hiway-missions.fr/*`                | défaut | Plateforme Hiway ; script de contenu de l'assistant de formulaire.                                                                                                                                 |
| `https://jhgjtlkfewuiiofxfrvh.supabase.co/*` | défaut | API REST Supabase **appartenant à Hiway** (clé anonyme publique du site Hiway) d'où proviennent les missions Hiway. Ce n'est pas un backend MissionPulse. Aucun script de contenu n'y est injecté. |
| `https://app.cherry-pick.io/*`               | défaut | Lecture des missions Cherry Pick ; script de contenu de l'assistant de formulaire.                                                                                                                 |
| `https://ai-gateway.vercel.sh/*`             | opt-in | Classification des missions par Vercel AI Gateway, uniquement si l'utilisateur enregistre sa propre clé.                                                                                           |

| Permission optionnelle      | Statut | Justification                                                                                          |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `optional_host_permissions` | opt-in | `https://www.linkedin.com/*`, demandé uniquement pendant le geste utilisateur d'import du profil actif |

Le script de contenu (`content_scripts`) de l'assistant de formulaire est injecté uniquement sur
les pages des 4 plateformes (`www.free-work.com`, `*.lehibou.com`, `hiway-missions.fr`,
`app.cherry-pick.io`) ; depuis 0.2.5, le host d'API Supabase de Hiway n'en reçoit plus
(`formAssistMatches` dans `apps/extension/src/lib/shell/connectors/meta.ts`). Il reste inerte tant
que l'assistant de formulaire n'est pas activé dans les paramètres (désactivé par défaut).

### Risques de revue pour 0.2.5

- Corrigés dans 0.2.5 (par rapport à 0.2.4) : `identity`, `activeTab`,
  `https://copilot.missionpulse.app/*` et `https://ai-gateway.vercel.app/*` retirés du manifest
  (Copilot fermé au build : le service worker n'instancie qu'un coordinateur désactivé) ; plus de
  script de contenu sur le host d'API Supabase de Hiway ; cookies LeHibou limités à ceux en portée
  de l'endpoint de liste des missions. `apps/extension/scripts/verify-manifest.ts` refuse désormais
  `identity` et `activeTab` dans un build de release.
- Risque résiduel : lecture de cookies tiers (LeHibou). Elle est nécessaire à la fonctionnalité,
  limitée à la portée de l'API et transmise uniquement à LeHibou ; la justification doit rester
  identique entre la fiche, le questionnaire et la politique de confidentialité.
- Risque résiduel : transfert du contenu des annonces à Vercel AI Gateway (opt-in, clé
  personnelle) ; la description, la politique et la catégorie « Contenu des sites Web » du
  questionnaire doivent rester cohérentes.
