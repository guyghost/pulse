# Politique de confidentialite — MissionPulse

**Date de derniere mise a jour** : 2026-10-06

---

## 1. Donnees collectees

MissionPulse collecte et traite les donnees suivantes pour faire fonctionner l'extension locale et, si vous connectez un compte MissionPulse, le dashboard connecte optionnel.

> **Version 0.2.4 de l'extension (Chrome Web Store)** : elle ne propose pas la connexion d'un compte MissionPulse et n'envoie aucune donnee a un serveur MissionPulse. Les elements marques « compte connecte » ci-dessous ne s'appliquent qu'au site missionpulse.app et a une future version de l'extension.

- **Profil utilisateur** : prenom, intitule de poste, competences, TJM cible, preferences de remote et seniorite — renseignes lors de l'onboarding et dans les parametres.
- **Missions** : titre, description, TJM, localisation, source, date de publication et metadonnees de scoring — extraites depuis les plateformes connectees.
- **Preferences** : intervalle de scan, connecteurs actives, seuils de notification, parametres d'analyse locale.
- **Donnees locales de fonctionnement** : favoris, missions masquees, missions deja vues, cache semantique local, historique TJM et etat des connecteurs.
- **Donnees synchronisees du dashboard** (compte connecte) : snapshots normalises de missions, scores, pipeline de candidature, assets generes, profil CV canonique, historique d'import et etat de synchronisation.
- **Liaisons multi-compte** (compte connecte) : plateforme, libelle choisi, compte actif et hash
  pseudonymise de la session detectee. Aucun cookie brut n'est synchronise.
- **Assistance de formulaire** : apres consentement explicite, les champs
  autorises et suggestions restent dans une session ephemere locale le temps de
  la revue. Ils ne sont pas envoyes au dashboard.
- **Classification de missions (optionnelle)** : uniquement si vous enregistrez
  votre propre cle Vercel AI Gateway dans les parametres, le titre (200 caracteres max), les technologies, le mode de travail et la description (1 500 caracteres max) des missions enregistrees pas encore classees sont envoyes a Vercel AI Gateway pour etre categorises, jusqu'a 25 missions par scan par defaut (reglable de 0 a 100) ; cela peut inclure des missions recuperees lors de scans precedents. Votre profil
  n'est pas envoye. La cle reste dans `chrome.storage.local`.

L'execution plateforme reste locale dans votre navigateur. La synchronisation cloud est optionnelle et limitee aux donnees produit normalisees necessaires au dashboard connecte.

---

## 2. Stockage

Les donnees sont stockees via plusieurs mecanismes du navigateur :

- **chrome.storage.local** : parametres, favoris, missions masquees, cache semantique local, cle Vercel AI Gateway facultative et autres donnees legeres.
- **IndexedDB** : profil, missions scrapees, historique TJM, etats de connecteurs et donnees plus volumineuses.
- **Stockage de session** : certains etats temporaires de scan ou d'interface peuvent etre gardes localement pendant l'execution.
- **Supabase** (compte connecte, indisponible dans l'extension 0.2.4) : si vous connectez un compte MissionPulse, le dashboard peut synchroniser des snapshots normalisés via Supabase pour vos missions, candidatures, assets generes, CV canonique, conflits et statuts de synchronisation.

La suppression de l'extension entraine la suppression des donnees associees a son stockage local.
Le dashboard fournit aussi des controles d'export et de suppression des donnees connectees.

---

## 3. IA locale et classification optionnelle

MissionPulse peut utiliser les capacites d'IA **locales au navigateur**,
notamment Gemini Nano via la Prompt API de Chrome, pour enrichir le scoring
semantique des missions et proposer des valeurs pour les champs autorises d'un
formulaire de candidature.

- Aucune cle API externe n'est requise : les fonctions d'IA actives par defaut sont locales.
- Exception optionnelle : si vous saisissez votre propre cle Vercel AI Gateway,
  la classification des missions envoie le contenu des annonces decrit en
  section 1 a Vercel AI Gateway (modele `typesafe-ai/jev`), avec la
  conservation des donnees desactivee dans la requete (`zeroDataRetention`).
  Sans cle, ce service reste inactif. Le traitement par Vercel est regi par
  la politique de confidentialite de Vercel.
- Les scores semantiques sont mis en cache localement pour limiter les recalculs.
- Si l'IA locale n'est pas disponible, l'application continue de fonctionner avec son scoring de base.
- L'assistance de formulaire s'execute dans un Worker local dedie, exige un
  consentement explicite et une validation champ par champ.
- MissionPulse ne soumet jamais le formulaire et n'utilise aucun fallback cloud
  sans un nouveau consentement explicite.

---

## 4. Cookies et sessions navigateur

MissionPulse peut acceder en **lecture seule** aux cookies ou aux sessions navigateur necessaires pour detecter l'etat de connexion sur les plateformes supportees et recuperer les missions accessibles a l'utilisateur.

Plateformes actuellement supportees :

- **Free-Work** (`www.free-work.com`)
- **LeHibou** (`*.lehibou.com`)
- **Hiway** (`hiway-missions.fr`)
- **Cherry Pick** (`app.cherry-pick.io`)

MissionPulse **ne modifie, ne cree et ne supprime aucun cookie utilisateur**. Dans la version 0.2.4 :

- **LeHibou** : l'extension verifie la presence de votre cookie de session LeHibou, puis joint les cookies du domaine lehibou.com (tous sous-domaines confondus) aux seules requetes qu'elle envoie a l'API LeHibou (`api.lehibou.com`), pour lire les missions qui vous sont accessibles. Pour cela, l'en-tete Cookie est place temporairement dans une regle reseau dynamique (`declarativeNetRequest`) supprimee apres la requete et au redemarrage de l'extension ; si le navigateur s'interrompt pendant un scan, cette regle peut subsister jusqu'au redemarrage suivant.
- **LinkedIn** (import declenche par vous) : l'extension verifie seulement la presence du cookie de session LinkedIn.
- **Cherry Pick** : l'extension ne lit pas vos cookies ; comme lors d'une visite normale, le navigateur peut joindre vos cookies Cherry Pick aux requetes envoyees a Cherry Pick.
- **Hiway** : aucune session n'est requise et l'extension ne lit pas de cookies ; le navigateur peut joindre d'eventuels cookies existants du domaine Supabase de Hiway.
- **Free-Work** : requetes envoyees sans cookies.

Aucun cookie n'est envoye a MissionPulse ni a un service exterieur a la plateforme concernee.

Nous ne synchronisons pas les mots de passe, cookies, jetons de session des plateformes, ni le HTML brut LinkedIn. Les imports LinkedIn stockent uniquement les champs normalises necessaires au CV, un hash et des compteurs de champs.

---

## 5. Permissions

| Permission                | Utilisation                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `sidePanel`               | Affiche le panneau lateral contenant le feed, le dashboard TJM et les parametres.       |
| `storage`                 | Sauvegarde locale des preferences, caches et donnees de fonctionnement.                 |
| `cookies`                 | Detection de session sur les plateformes supportees lorsque c'est necessaire.           |
| `scripting` / `activeTab` | Import LinkedIn et assistance de formulaire declenches explicitement par l'utilisateur. |
| `alarms`                  | Planification des cycles de scan automatiques a intervalles reguliers.                  |
| `notifications`           | Alertes lors de la detection de nouvelles missions pertinentes.                         |
| `declarativeNetRequest`   | Application de regles reseau temporaires necessaires a certains connecteurs.            |
| `identity`                | Connexion future du Copilot au compte MissionPulse ; inutilisee dans l'extension 0.2.4. |

---

## 6. Services externes contactes

MissionPulse peut communiquer directement depuis votre navigateur avec les domaines des plateformes supportees pour recuperer les missions, ainsi qu'avec les services strictement necessaires a leur fonctionnement selon les permissions declarees. Dans la version 0.2.4 :

- **Plateformes** : `www.free-work.com`, `*.lehibou.com`, `hiway-missions.fr`, `app.cherry-pick.io`, avec vos mots-cles de recherche.
- **Supabase de Hiway** (`jhgjtlkfewuiiofxfrvh.supabase.co`) : API publique appartenant a Hiway, d'ou proviennent les missions Hiway. Ce n'est pas un serveur MissionPulse.
- **Vercel AI Gateway** (`ai-gateway.vercel.sh`) : uniquement avec votre propre cle (section 3).
- **Service de favicons Google** (`www.google.com/s2/favicons`) : affichage des icones des plateformes ; seul le nom de domaine de la plateforme est transmis.
- **Pas de serveur MissionPulse** : `copilot.missionpulse.app` est declare dans le manifest. L'interface de la version 0.2.4 n'emet aucune requete vers ce domaine ; le code de reprise ou de suppression du Copilot ne peut le contacter qu'avec une session Copilot deja ouverte (conservee dans `chrome.storage.session`, effacee a la fermeture du navigateur), qui ne peut pas etre creee dans la version 0.2.4. Aucun outil d'analytics ni de telemetrie n'est integre.

Aucun backend MissionPulse ne scrape les plateformes a votre place. Le dashboard connecte utilise Supabase uniquement pour stocker et synchroniser les donnees produit de votre compte.

---

## 7. Contact

Pour toute question relative a la confidentialite de vos donnees, veuillez nous contacter a :

**Email** : privacy@missionpulse.app

---

_MissionPulse est un projet open-source. Le code est disponible pour audit._
