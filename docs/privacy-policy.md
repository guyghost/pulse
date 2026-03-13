# Politique de confidentialite — MissionPulse

**Date de derniere mise a jour** : 2026-03-13

---

## 1. Donnees collectees

MissionPulse collecte et traite les donnees suivantes, **toutes stockees localement** sur votre appareil :

- **Profil utilisateur** : prenom, intitule de poste, competences, TJM cible — renseignes manuellement lors de l'onboarding.
- **Missions** : titre, description, TJM, localisation, source, date de publication — extraites automatiquement des plateformes connectees.
- **Preferences** : filtres de recherche, criteres de scoring, seuils de notification.
- **Configuration** : cle API Anthropic, parametres d'affichage, etat des connecteurs.

Aucune donnee n'est transmise a un serveur externe. L'ensemble du traitement s'effectue dans le navigateur.

---

## 2. Stockage

Les donnees sont stockees via deux mecanismes du navigateur :

- **chrome.storage.local** : profil, preferences et configuration (donnees legeres, synchronisees entre les contextes de l'extension).
- **IndexedDB** : missions scrapees, historique de scoring (donnees volumineuses).

Aucun serveur distant n'est utilise pour le stockage. La suppression de l'extension entraine la suppression de toutes les donnees associees.

---

## 3. Cle API

- La cle API Anthropic est stockee **exclusivement en local** dans `chrome.storage.local`.
- Elle est utilisee pour effectuer des appels directs a l'API Anthropic (analyse TJM, scoring contextuel).
- La cle n'est **jamais partagee**, transmise a un tiers ou envoyee a nos serveurs (nous n'en avons pas).

---

## 4. Cookies

MissionPulse accede en **lecture seule** aux cookies des domaines suivants :

- `www.free-work.com`
- `www.malt.fr`
- `app.comet.co`

Cet acces permet de detecter si l'utilisateur dispose d'une session active sur ces plateformes afin d'effectuer le scraping des missions. MissionPulse **ne modifie, ne cree et ne supprime aucun cookie**.

---

## 5. Permissions

| Permission | Utilisation |
|---|---|
| `sidePanel` | Affiche le panneau lateral contenant le feed de missions. |
| `storage` | Sauvegarde locale du profil, des preferences et de la configuration. |
| `cookies` | Detection de session sur Free-Work, Malt et Comet (lecture seule). |
| `alarms` | Planification des cycles de scraping automatiques a intervalles reguliers. |
| `notifications` | Alertes lors de la detection de nouvelles missions correspondant au profil. |
| `offscreen` | Creation d'un document hors-ecran pour executer le scraping sans onglet visible. |

---

## 6. Contact

Pour toute question relative a la confidentialite de vos donnees, veuillez nous contacter a :

**Email** : [a completer]

---

*MissionPulse est un projet open-source. Le code est disponible pour audit.*
