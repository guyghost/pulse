# Politique de confidentialite — MissionPulse

**Date de derniere mise a jour** : 2026-04-02

---

## 1. Donnees collectees

MissionPulse collecte et traite les donnees suivantes, **toutes stockees localement** sur votre appareil :

- **Profil utilisateur** : prenom, intitule de poste, competences, TJM cible, preferences de remote et seniorite — renseignes lors de l'onboarding et dans les parametres.
- **Missions** : titre, description, TJM, localisation, source, date de publication et metadonnees de scoring — extraites depuis les plateformes connectees.
- **Preferences** : intervalle de scan, connecteurs actives, seuils de notification, parametres d'analyse locale.
- **Donnees locales de fonctionnement** : favoris, missions masquees, missions deja vues, cache semantique local, historique TJM et etat des connecteurs.

Aucune donnee n'est transmise a des serveurs MissionPulse. L'ensemble du stockage applicatif s'effectue localement dans le navigateur. L'extension contacte uniquement les plateformes supportees et leurs API techniques pour recuperer les missions demandees par l'utilisateur.

---

## 2. Stockage

Les donnees sont stockees via plusieurs mecanismes du navigateur :

- **chrome.storage.local** : parametres, favoris, missions masquees, cache semantique local et autres donnees legeres.
- **IndexedDB** : profil, missions scrapees, historique TJM, etats de connecteurs et donnees plus volumineuses.
- **Stockage de session** : certains etats temporaires de scan ou d'interface peuvent etre gardes localement pendant l'execution.

La suppression de l'extension entraine la suppression des donnees associees a son stockage local.

Durees de conservation locales :

- **Missions** : purge automatique des missions de plus de 90 jours.
- **Cache semantique** : expiration apres 7 jours ou suppression lors d'un changement de profil.
- **Logs d'erreurs locaux** : tampon limite aux 50 dernieres entrees, sans envoi automatique.

Les exports CSV, JSON, Markdown et les backups `.pulse-backup` sont crees localement par l'utilisateur. Ces fichiers ne sont pas chiffres par MissionPulse ; leur protection depend de l'emplacement ou l'utilisateur les conserve.

---

## 3. IA locale

MissionPulse peut utiliser les capacites d'IA **locales au navigateur**, notamment Gemini Nano via la Prompt API de Chrome, pour enrichir le scoring semantique des missions.

- Aucune cle API externe n'est requise dans l'experience actuelle de l'application.
- Les scores semantiques sont mis en cache localement pour limiter les recalculs.
- Si l'IA locale n'est pas disponible, l'application continue de fonctionner avec son scoring de base.

---

## 4. Cookies et sessions navigateur

MissionPulse peut lire les cookies ou sessions navigateur necessaires pour detecter l'etat de connexion sur les plateformes supportees et recuperer les missions accessibles a l'utilisateur. Pour certains connecteurs, l'extension reutilise localement des cookies de session autorises dans les requetes API de la plateforme concernee, via des regles reseau temporaires.

Plateformes actuellement supportees :

- `www.free-work.com`
- `*.lehibou.com`
- `hiway-missions.fr`
- `jhgjtlkfewuiiofxfrvh.supabase.co` (API publique utilisee par Hiway)
- `*.collective.work`
- `app.cherry-pick.io`

MissionPulse **ne modifie, ne cree et ne supprime aucun cookie utilisateur**. Les cookies reutilises sont limites par connecteur a une liste de noms de cookies de session attendus. Ces acces servent uniquement au fonctionnement local de l'extension.

---

## 5. Permissions

| Permission | Utilisation |
|---|---|
| `sidePanel` | Affiche le panneau lateral contenant le feed, le dashboard TJM et les parametres. |
| `storage` | Sauvegarde locale des preferences, caches et donnees de fonctionnement. |
| `cookies` | Detection de session sur les plateformes supportees lorsque c'est necessaire. |
| `alarms` | Planification des cycles de scan automatiques a intervalles reguliers. |
| `notifications` | Alertes lors de la detection de nouvelles missions pertinentes. |
| `declarativeNetRequest` | Application de regles reseau necessaires a certains connecteurs : headers Origin/Referer et, quand necessaire, header Cookie limite aux cookies de session autorises. |

---

## 6. Services externes contactes

MissionPulse peut communiquer directement depuis votre navigateur avec les domaines des plateformes supportees pour recuperer les missions, ainsi qu'avec les services strictement necessaires a leur fonctionnement selon les permissions declarees. Le connecteur Hiway interroge notamment l'API Supabase publique utilisee par hiway-missions.fr avec une cle anon publique.

Aucun backend MissionPulse n'intervient dans ce traitement.

---

## 7. Contact

Pour toute question relative a la confidentialite de vos donnees, veuillez nous contacter a :

**Email** : privacy@missionpulse.app

---

*MissionPulse est un projet open-source. Le code est disponible pour audit.*
