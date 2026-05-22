# Politique de confidentialite — MissionPulse

**Date de derniere mise a jour** : 2026-05-22

---

## 1. Donnees collectees

MissionPulse collecte et traite les donnees suivantes pour faire fonctionner l'extension locale et, si vous connectez un compte MissionPulse, le dashboard connecte optionnel :

- **Profil utilisateur** : prenom, intitule de poste, competences, TJM cible, preferences de remote et seniorite — renseignes lors de l'onboarding et dans les parametres.
- **Missions** : titre, description, TJM, localisation, source, date de publication et metadonnees de scoring — extraites depuis les plateformes connectees.
- **Preferences** : intervalle de scan, connecteurs actives, seuils de notification, parametres d'analyse locale.
- **Donnees locales de fonctionnement** : favoris, missions masquees, missions deja vues, cache semantique local, historique TJM et etat des connecteurs.
- **Donnees synchronisees du dashboard** : snapshots normalises de missions, scores, pipeline de candidature, assets generes, profil CV canonique, historique d'import et etat de synchronisation.

L'execution plateforme reste locale dans votre navigateur. La synchronisation cloud est optionnelle et limitee aux donnees produit normalisees necessaires au dashboard connecte.

---

## 2. Stockage

Les donnees sont stockees via plusieurs mecanismes du navigateur :

- **chrome.storage.local** : parametres, favoris, missions masquees, cache semantique local et autres donnees legeres.
- **IndexedDB** : profil, missions scrapees, historique TJM, etats de connecteurs et donnees plus volumineuses.
- **Stockage de session** : certains etats temporaires de scan ou d'interface peuvent etre gardes localement pendant l'execution.
- **Supabase** : si vous connectez un compte MissionPulse, le dashboard peut synchroniser des snapshots normalisés via Supabase pour vos missions, candidatures, assets generes, CV canonique, conflits et statuts de synchronisation.

La suppression de l'extension entraine la suppression des donnees associees a son stockage local.
Le dashboard fournit aussi des controles d'export et de suppression des donnees connectees.

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

Nous ne synchronisons pas les mots de passe, cookies, jetons de session des plateformes, ni le HTML brut LinkedIn. Les imports LinkedIn stockent uniquement les champs normalises necessaires au CV, un hash et des compteurs de champs.

---

## 5. Permissions

| Permission                | Utilisation                                                                       |
| ------------------------- | --------------------------------------------------------------------------------- |
| `sidePanel`               | Affiche le panneau lateral contenant le feed, le dashboard TJM et les parametres. |
| `storage`                 | Sauvegarde locale des preferences, caches et donnees de fonctionnement.           |
| `cookies`                 | Detection de session sur les plateformes supportees lorsque c'est necessaire.     |
| `scripting` / `activeTab` | Import LinkedIn declenche par l'utilisateur depuis un onglet de profil ouvert.    |
| `alarms`                  | Planification des cycles de scan automatiques a intervalles reguliers.            |
| `notifications`           | Alertes lors de la detection de nouvelles missions pertinentes.                   |
| `declarativeNetRequest`   | Application de regles reseau temporaires necessaires a certains connecteurs.      |

---

## 6. Services externes contactes

MissionPulse peut communiquer directement depuis votre navigateur avec les domaines des plateformes supportees pour recuperer les missions, ainsi qu'avec les services strictement necessaires a leur fonctionnement selon les permissions declarees.

Aucun backend MissionPulse ne scrape les plateformes a votre place. Le dashboard connecte utilise Supabase uniquement pour stocker et synchroniser les donnees produit de votre compte.

---

## 7. Contact

Pour toute question relative a la confidentialite de vos donnees, veuillez nous contacter a :

**Email** : [a completer]

---

_MissionPulse est un projet open-source. Le code est disponible pour audit._
