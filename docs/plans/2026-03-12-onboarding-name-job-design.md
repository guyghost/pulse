# Design: Onboarding — Prenom + Poste recherche

## Contexte

L'onboarding actuel demande: titre/poste, stack technique, TJM cible.
L'utilisateur veut donner son prenom (pour personnaliser l'UI) et preciser le poste recherche.

## Decision

Approche A retenue: enrichir le formulaire unique existant (pas de multi-step).

## Changements

### 1. Type `UserProfile` (`src/lib/core/types/profile.ts`)

- Ajouter `firstName: string`
- Renommer `title` -> `jobTitle` (plus explicite)

### 2. `OnboardingWizard.svelte`

- Nouveau champ "Prenom" en premiere position (`id: ob-firstname`)
- Renommer label "Titre / Poste" -> "Poste recherche"
- Placeholder: "ex: Developpeur React Senior"
- `canSubmit` requiert prenom ET poste non vides
- `handleComplete` envoie `firstName` dans le profil

### 3. Personnalisation du feed

- Afficher "Bonjour, {firstName}" dans le header quand le profil est charge

### 4. Machine XState

- Aucun changement structurel — `SET_PROFILE` gere deja les updates partielles

### 5. Renommage `title` -> `jobTitle`

- Grep toutes les occurrences de `profile.title` et `title:` dans le contexte profil
- Adapter partout (machine, composants, tests, scoring)

### 6. Tests

- Unit: adapter `onboarding.test.ts` pour `jobTitle` au lieu de `title`
- E2E: remplir prenom, verifier bouton disabled sans prenom
- E2E: verifier affichage "Bonjour, {prenom}" sur le feed
