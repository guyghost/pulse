# Politique de confidentialite — MissionPulse

**Date de derniere mise a jour** : 2026-04-02

---

## 1. Donnees collectees

MissionPulse collecte et traite les donnees suivantes, **toutes stockees localement** sur votre appareil :

- **Profil utilisateur** : prenom, intitule de poste, competences, TJM cible, preferences de remote et seniorite — renseignes lors de l'onboarding et dans les parametres.
- **Missions** : titre, description, TJM, localisation, source, date de publication et metadonnees de scoring — extraites depuis les plateformes connectees.
- **Preferences** : intervalle de scan, connecteurs actives, seuils de notification, parametres d'analyse locale.
- **Donnees locales de fonctionnement** : favoris, missions masquees, missions deja vues, cache semantique local, historique TJM et etat des connecteurs.

Aucune donnee n'est transmise a nos serveurs. L'ensemble du stockage applicatif s'effectue localement dans le navigateur.

---

## 2. Stockage

Les donnees sont stockees via plusieurs mecanismes du navigateur :

- **chrome.storage.local** : parametres, favoris, missions masquees, cache semantique local et autres donnees legeres.
- **IndexedDB** : profil, missions scrapees, historique TJM, etats de connecteurs et donnees plus volumineuses.
- **Stockage de session** : certains etats temporaires de scan ou d'interface peuvent etre gardes localement pendant l'execution.

La suppression de l'extension entraine la suppression des donnees associees a son stockage local.

---

## 3. IA locale

MissionPulse peut utiliser les capacites d'IA **locales au navigateur**, notamment Gemini Nano via la Prompt API de Chrome, pour enrichir le scoring semantique des missions.

- Aucune cle API externe n'est requise dans l'experience actuelle de l'application.
- Les scores semantiques sont mis en cache localement pour limiter les recalculs.
- Si l'IA locale n'est pas disponible, l'application continue de fonctionner avec son scoring de base.

---

## 4. Cookies et sessions navigateur

MissionPulse peut acceder en **lecture seule** aux cookies ou aux sessions navigateur necessaires pour detecter l'etat de connexion sur les plateformes supportees et recuperer les missions accessibles a l'utilisateur.

Plateformes actuellement supportees :

- `www.free-work.com`
- `*.lehibou.com`
- `hiway-missions.fr`
- `*.collective.work`
- `app.cherry-pick.io`

MissionPulse **ne modifie, ne cree et ne supprime aucun cookie utilisateur**. Ces acces servent uniquement au fonctionnement local de l'extension.

---

## 5. Permissions

| Permission | Utilisation |
|---|---|
| `sidePanel` | Affiche le panneau lateral contenant le feed, le dashboard TJM et les parametres. |
| `storage` | Sauvegarde locale des preferences, caches et donnees de fonctionnement. |
| `cookies` | Detection de session sur les plateformes supportees lorsque c'est necessaire. |
| `alarms` | Planification des cycles de scan automatiques a intervalles reguliers. |
| `notifications` | Alertes lors de la detection de nouvelles missions pertinentes. |
| `declarativeNetRequest` | Application de regles reseau temporaires necessaires a certains connecteurs. |

---

## 6. Services externes contactes

MissionPulse peut communiquer directement depuis votre navigateur avec les domaines des plateformes supportees pour recuperer les missions, ainsi qu'avec les services strictement necessaires a leur fonctionnement selon les permissions declarees.

Aucun backend MissionPulse n'intervient dans ce traitement.

---

## 7. Contact

Pour toute question relative a la confidentialite de vos donnees, veuillez nous contacter a :

**Email** : [a completer]

---

*MissionPulse est un projet open-source. Le code est disponible pour audit.*
