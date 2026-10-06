# Chrome Web Store — Brouillon du questionnaire « Pratiques de confidentialité »

Brouillon pour l'onglet **Pratiques de confidentialité** du dashboard développeur Chrome Web
Store, aligné sur le package **0.2.4** scellé (commit
`fff1872c9d1544abc5e3c6d2957fd17ef8a0f028`, GitHub Release `v0.2.4`, `missionpulse.zip`
SHA-256 `4a919e6a1ae72921500f7dd5cf1041afb702b60a2a8e2280da17c841f5afb1db`).

Chaque bloc entre guillemets se colle tel quel dans le champ du même nom. Les affirmations
renvoient au code source du commit scellé (chemins sous `apps/extension/`) et ont été vérifiées
dans le bundle livré. Toute nouvelle version qui change le manifest ou un flux réseau exige de
revoir ce document avant soumission.

> Ce document ne vaut ni soumission ni reçu de readiness Store (voir `docs/PRODUCTION.md`,
> « Frontière Chrome Web Store »).

---

## 1. Objectif unique (Single purpose)

> MissionPulse regroupe dans le panneau latéral de Chrome les missions freelance tech publiées
> sur Free-Work, LeHibou, Hiway et Cherry Pick, puis les classe selon le profil que l'utilisateur
> renseigne (compétences, TJM, localisation, remote) pour l'aider à choisir les missions à
> consulter. Les fonctions annexes (radar TJM, profil/CV local, import LinkedIn, aide au
> remplissage de formulaires de candidature, notifications) servent toutes ce même objectif de
> recherche de missions.

---

## 2. Justification des permissions

### `sidePanel`

> L'interface complète de l'extension (feed de missions, profil, CV, suivi des candidatures,
> radar TJM, paramètres) est affichée dans le panneau latéral de Chrome.

### `storage`

> Enregistre localement (chrome.storage.local) les paramètres, favoris, missions masquées,
> caches de scoring et, si l'utilisateur la saisit, sa clé Vercel AI Gateway personnelle. Rien
> n'est synchronisé via chrome.storage.sync.

### `cookies`

> Pour LeHibou, l'extension vérifie la présence du cookie de session LeHibou afin de savoir si
> l'utilisateur est connecté, puis joint les cookies du domaine lehibou.com aux seules requêtes qu'elle envoie à l'API LeHibou (api.lehibou.com) pour lire les missions visibles par l'utilisateur. Pour l'import LinkedIn
> déclenché par l'utilisateur, elle vérifie uniquement la présence du cookie de session
> LinkedIn. Les cookies ne sont jamais modifiés ni envoyés en dehors de la plateforme concernée. Pour LeHibou, l'en-tête Cookie est conservé temporairement dans une règle declarativeNetRequest dynamique, supprimée après la requête et au démarrage du service worker.

### `alarms`

> Planifie le scan automatique périodique des plateformes, le digest quotidien des missions et
> les vérifications de santé des connecteurs.

### `notifications`

> Affiche une notification lorsque de nouvelles missions à score élevé sont trouvées, le digest
> quotidien, et une suggestion d'activer le scan automatique.

### `declarativeNetRequest`

> Ajoute des règles dynamiques limitées aux domaines des plateformes supportées : en-têtes
> Origin/Referer attendus par les API Free-Work et LeHibou, et en-tête Cookie LeHibou pour les
> requêtes XHR de l'extension vers LeHibou. Aucune règle ne s'applique à d'autres sites, aucun
> blocage ni redirection de navigation.

### `scripting`

> Utilisé après un clic de l'utilisateur sur « Importer depuis LinkedIn » : exécute un script d'extraction dans les onglets LinkedIn du profil (y compris un onglet de détail des expériences ouvert par l'extension) pour lire les champs du profil (poste, expériences, compétences) et pré-remplir le profil local de l'extension. Le code contient aussi une aide au remplissage de formulaires de candidature qui lit puis remplit, après validation, les champs du formulaire de l'onglet actif ; elle exige un compte MissionPulse et n'est pas accessible dans la version 0.2.4.

### `activeTab`

> Vérifiée par le flux d'import LinkedIn avant toute extraction, déclenchée par un clic de l'utilisateur. L'accès effectif aux pages LinkedIn repose sur la permission optionnelle https://www.linkedin.com/* accordée pendant ce geste.

⚠️ `activeTab` est aujourd'hui seulement vérifiée (`ensureExtractionPermission()` dans `src/lib/shell/profile-extractors/linkedin.extractor.ts`). Elle ne limite pas réellement l'extraction à l'onglet actif, d'où un risque de permission jugée superflue. Voir § 7.

### `identity`

> Réservé à la connexion OAuth (chrome.identity.launchWebAuthFlow) du module Copilot au compte
> MissionPulse. Dans la version 0.2.4, ce module est désactivé à la compilation et son interface
> n'est pas affichée : la permission n'est jamais utilisée.

⚠️ Réponse honnête mais faible : une permission déclarée et inutilisée est un motif classique
de rejet. Voir § 7.

### Justification des autorisations d'hôte (champ unique « Host permission justification »)

> Free-Work (www.free-work.com), LeHibou (*.lehibou.com), Hiway (hiway-missions.fr) et
> Cherry Pick (app.cherry-pick.io) : lecture des missions publiées sur ces plateformes,
> directement depuis le navigateur de l'utilisateur, et script de contenu de l'assistant de
> formulaire (désactivé par défaut) sur leurs formulaires de candidature.
> jhgjtlkfewuiiofxfrvh.supabase.co : API REST publique appartenant à Hiway, d'où le site Hiway
> lui-même charge ses missions ; l'extension l'interroge avec la clé anonyme publique de Hiway.
> Ce n'est pas un serveur MissionPulse.
> ai-gateway.vercel.sh : utilisé seulement si l'utilisateur enregistre sa propre clé Vercel AI
> Gateway pour classer les missions (titre limité à 200 caractères, technologies, mode de travail, description limitée à 1 500 caractères, pour les missions enregistrées pas encore classées, 25 par scan par défaut ; profil jamais envoyé ; conservation désactivée).
> ai-gateway.vercel.app : domaine alternatif du même service, non appelé par la version 0.2.4.
> copilot.missionpulse.app : API du module Copilot, désactivé dans la version 0.2.4. L'interface n'y envoie aucune requête ; seul le code de reprise ou de suppression pourrait l'appeler avec une session Copilot déjà ouverte, qu'il est impossible de créer dans cette version.
> www.linkedin.com (permission optionnelle) : demandée uniquement au moment où l'utilisateur
> lance l'import de son profil LinkedIn.

---

## 3. Code distant

- Réponse : **Non, je n'utilise pas de code distant.**

> Tout le JavaScript est inclus dans le package. L'extension ne charge ni n'évalue aucun script
> externe ; les réponses réseau (plateformes, Vercel AI Gateway) sont traitées uniquement comme
> des données JSON ou HTML.

---

## 4. Utilisation des données — catégories collectées

Au sens du CWS, une donnée est « collectée » lorsqu'elle quitte l'appareil vers le développeur
ou un tiers. Le profil, le CV, les missions et l'historique TJM restent dans les stockages
locaux de l'extension. L'extension n'envoie aucune donnée à un serveur MissionPulse (voir la nuance Copilot au § 2), et il n'y a ni analytics ni
télémétrie (`configureErrorHandler`/`monitoringUrl` n'est jamais configuré dans le build).

| Catégorie CWS                           | Cocher             | Raison                                                                                                                                                                                                                            |
| --------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Informations personnelles identifiables | Non                | Le profil (prénom, poste, compétences) et l'import LinkedIn restent en local.                                                                                                                                                     |
| Informations sur la santé               | Non                | —                                                                                                                                                                                                                                 |
| Informations financières et de paiement | Non                | Aucun paiement dans l'extension. Le TJM cible reste en local.                                                                                                                                                                     |
| Informations d'authentification         | **Oui (prudence)** | Le cookie de session LeHibou est lu puis transmis à LeHibou lui-même. Aucun tiers ni MissionPulse ne le reçoit, mais il s'agit d'un identifiant manipulé par l'extension : le déclarer est l'option la plus sûre face à la revue. |
| Communications personnelles             | Non                | —                                                                                                                                                                                                                                 |
| Position                                | Non                | Aucune géolocalisation. La localisation souhaitée est une préférence locale.                                                                                                                                                      |
| Historique Web                          | Non                | L'extension ne lit pas l'historique de navigation.                                                                                                                                                                                |
| Activité de l'utilisateur               | Non                | Aucun suivi de clics, de frappes ou de navigation.                                                                                                                                                                                |
| Contenu des sites Web                   | **Oui**            | Le contenu des annonces (missions) est lu sur les plateformes. Avec la clé personnelle de l'utilisateur, le titre, les technologies, le mode de travail et la description sont envoyés à Vercel AI Gateway pour classification.   |

Si le dashboard demande une précision sur l'usage : « Fonctionnalité de l'application ».

---

## 5. Certifications (les trois cases à cocher)

- [x] Je ne vends pas et ne transfère pas les données utilisateur à des tiers, en dehors des cas
      d'utilisation approuvés. (Transferts, tous nécessaires à la fonctionnalité : critères de recherche envoyés aux plateformes de missions ; cookies LeHibou renvoyés à l'API LeHibou ; noms de domaine des plateformes demandés au service de favicons Google ; et, uniquement avec la clé de l'utilisateur, contenu des annonces envoyé à Vercel AI Gateway pour la classification. Aucune donnée n'est vendue ni envoyée à MissionPulse.)
- [x] Je n'utilise pas et ne transfère pas les données utilisateur à des fins sans rapport avec
      l'objectif unique de mon article.
- [x] Je n'utilise pas et ne transfère pas les données utilisateur pour déterminer la solvabilité
      ou à des fins de prêt.

---

## 6. URL de la politique de confidentialité

> https://missionpulse.app/privacy

Avant de coller cette URL, vérifier que la version publiée de la page correspond à
`apps/landing/src/routes/privacy/+page.svelte` sur `main` (mise à jour du 2026-10-06).

---

## 7. Points susceptibles de provoquer un rejet

1. **Permissions inutilisées** (`identity`, `https://copilot.missionpulse.app/*`,
   `https://ai-gateway.vercel.app/*`). Elles sont inatteignables dans 0.2.4 (rollout Copilot
   fail-closed : `apps/extension/src/lib/shell/copilot/config.ts`, compilé en
   `return false` ; surface `connected: false` dans `packages/domain/src/feature-flags.ts`). La
   règle CWS « permissions les plus étroites possibles » peut entraîner un refus. Correctif
   recommandé : une version 0.2.5 sans ces entrées, avec un nouveau seal et une nouvelle release.
2. **Script de contenu sur un host d'API** : `content_scripts.matches` inclut le host Supabase
   de Hiway (dérivé des `hostPermissions` du connecteur dans `vite.config.ts`). C'est inoffensif
   mais peut surprendre un réviseur.
3. **Lecture de cookies tiers** (LeHibou) : à justifier comme ci-dessus. La politique de
   confidentialité doit le mentionner, ce qui est fait depuis la mise à jour du 2026-10-06.
4. **`activeTab` seulement vérifiée** : l'import LinkedIn repose en réalité sur la permission optionnelle `https://www.linkedin.com/*` ; `activeTab` peut être jugée superflue. Correctif : la retirer, ainsi que sa vérification, dans la prochaine version.
5. **Transfert à Vercel AI Gateway** : la description, la politique et la catégorie « Contenu
   des sites Web » doivent rester cohérentes entre elles.
