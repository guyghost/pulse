# Chrome Web Store — Fiche de publication

---

## Informations generales

- **Nom** : MissionPulse
- **Categorie** : Productivity
- **Langue** : Francais

---

## Resume court

> Agregateur de missions freelance : centralise plusieurs plateformes, score la pertinence et suit les tendances TJM.

---

## Description detaillee

**MissionPulse** est une extension Chrome pour les freelances tech qui centralise les missions de plusieurs plateformes dans un panneau lateral unique.

### Fonctionnalites

- **Feed centralise** — Regroupe dans une seule interface les missions publiees sur plusieurs plateformes freelance.
- **Score de pertinence** — Chaque mission recoit un score base sur vos competences, votre TJM cible, votre localisation et vos preferences de remote.
- **Analyse semantique locale** — Utilise l'IA locale du navigateur (Gemini Nano / Prompt API de Chrome, lorsqu'elle est disponible) pour enrichir le tri des missions.
- **Dashboard TJM** — Suit les tendances de taux journalier a partir de l'historique local des missions detectees.
- **Deduplication intelligente** — Detecte et fusionne les missions publiees sur plusieurs plateformes.
- **Notifications** — Vous alerte lorsqu'une mission pertinente est detectee.
- **100 % local** — Vos donnees, votre profil, vos favoris et vos caches restent dans votre navigateur.

### Plateformes supportees

- Free-Work
- LeHibou
- Hiway
- Collective
- Cherry Pick

### Comment ca marche

1. **Installez** l'extension depuis le Chrome Web Store.
2. **Configurez** votre profil : competences, TJM cible, localisation et preferences.
3. **Connectez-vous** aux plateformes supportees dans votre navigateur si necessaire.
4. **Ouvrez le panneau lateral** — MissionPulse agrege les missions detectees et les affiche triees par pertinence.

### Vie privee

MissionPulse ne s'appuie pas sur un backend proprietaire pour stocker vos donnees. Le profil, les missions, les favoris, les caches et l'historique TJM restent stockes localement via `chrome.storage.local` et IndexedDB. Quand l'IA locale est disponible dans Chrome, elle est utilisee directement depuis le navigateur sans cle API externe dans l'experience actuelle du produit.
