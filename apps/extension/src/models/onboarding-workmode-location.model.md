# Onboarding — Modèle des champs Mode de travail & Localisation

Source de vérité pour les champs de collecte du profil lors de l'onboarding qui
capturent **où** un freelance souhaite travailler (localisation) et **comment**
(mode de travail / télétravail). Compagnon de `profile-state.model.md` (cycle de
vie de la persistance) et de `keywords-unification.model.md` (collecte des
mots-clés). Ce changement est consigné ici en attente d'implémentation ; le
schéma `UserProfile` prend déjà en charge chaque champ — ce changement corrige
uniquement ce que l'onboarding **collecte**.

## Problème

`OnboardingWizard.svelte` mélange aujourd'hui les deux concepts :

- Un unique champ texte `location` avec le placeholder `ex: Paris ou remote`
  mélange un lieu avec un mode d'organisation du travail, si bien que les
  utilisateurs saisissent l'un ou l'autre et que le signal est ambigu pour le
  scorer de localisation (`core/scoring/location-matching.ts`).
- `remote` est **codé en dur à `'any'`** dans `handleComplete()`. La préférence
  de mode de travail n'est jamais collectée à la première utilisation, bien que
  `UserProfile.remote` (`RemoteType | 'any'`, où
  `RemoteType = 'full' | 'hybrid' | 'onsite'`) et le poids de scoring `remote`
  (`DEFAULT_SCORING_WEIGHTS.remote = 15`) existent.

La surface d'édition du profil (`ProfileSection.svelte`) expose déjà deux champs
distincts — une saisie texte `profileLocation` et un sélecteur `profileRemote`
avec les options `Indifférent / Remote / Hybride / Présentiel`. L'onboarding doit
correspondre à cette séparation afin que les données de première utilisation
alimentent le même scorer avec la même forme.

## Champs

| Champ           | Clé profil | Type                  | Contrôle onboarding        | Défaut  | Requis |
| --------------- | ---------- | --------------------- | -------------------------- | ------- | ------ |
| Localisation    | `location` | `string`              | Saisie texte (lieu seul)   | `''`    | Non    |
| Mode de travail | `remote`   | `RemoteType \| 'any'` | Contrôle segmenté (4 opts) | `'any'` | Non    |

Options de mode de travail (valeurs et libellés **identiques** à
`ProfileSection.remoteOptions`) :

| valeur     | libellé     |
| ---------- | ----------- |
| `'any'`    | Indifférent |
| `'full'`   | Remote      |
| `'hybrid'` | Hybride     |
| `'onsite'` | Présentiel  |

`'any'` est la valeur explicite « sans préférence » déjà utilisée partout où
`remote` est optionnel ; elle doit rester la valeur par défaut afin que
l'onboarding reste opt-in et que le repli `withProfileDefaults` existant reste
inchangé.

## États (par champ, locaux au wizard)

```
location:  untouched ('') ──input──► filled (string) ──clear──► untouched
remote:    untouched ('any') ──select──► chosen (full|hybrid|onsite) ──select 'any'──► 'any'
```

Les deux champs sont toujours « valides » — il n'existe aucun état d'erreur pour
eux. Ils sont optionnels et ne bloquent jamais `canSubmit`.

## Événements

| Événement              | Source              | Effet                                                                          |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `LOCATION_INPUT`       | saisie localisation | état `location` mis à jour                                                     |
| `REMOTE_SELECT(value)` | contrôle segmenté   | état `remote` mis à jour à `value`                                             |
| `SUBMIT`               | bouton Sauvegarder  | construit le brouillon via `normalizeProfileDraft({ …, location, remote, … })` |

Sur `SUBMIT`, le wizard appelle `onUpdateProfile(profile)` puis
`onComplete(profile)`, exactement comme aujourd'hui — seule la valeur `remote`
cesse d'être codée en dur.

## Flux de données

```
OnboardingWizard ($state local : location, remote)
   │  SUBMIT
   ▼
normalizeProfileDraft({ firstName, jobTitle, location, remote, keywords, tjmMin, tjmMax, seniority })
   │  (pur — accepte déjà `remote`, défaut à 'any')
   ▼
UserProfile  ──onUpdateProfile──►  OnboardingPage.profileDraft  ──PROFILE_UPDATED──► profile store
   │
   └──onComplete──► profile store.SUBMIT_PROFILE ──save()──► IndexedDB
                                                          │
                                                          ▼
                          scoring : relevance.ts utilise location (matchLocation) + poids remote
```

Aucun nouveau type de message, aucune modification du bridge, aucune
modification de schéma. `normalizeProfileDraft` et `withProfileDefaults` gèrent
déjà `remote` et `location`.

## Invariants

1. **Séparation.** `location` ne porte qu'un lieu ; `remote` ne porte que le
   mode de travail. Le placeholder de localisation ne doit pas suggérer
   « remote » comme valeur de localisation.
2. **Parité de vocabulaire.** Les valeurs et libellés du mode de travail dans
   l'onboarding forment exactement le même ensemble que
   `ProfileSection.remoteOptions`. La barre de filtres (`FilterBar.remoteTypes`)
   utilise un jeu de libellés différent (`Full remote / Hybride / Sur site`) car
   il s'agit d'un filtre de mission, non d'une préférence de profil — cette
   différence est intentionnelle et hors périmètre ici.
3. **Sécurité par défaut.** Un mode de travail sauté ou non touché se résout en
   `'any'` ; une localisation non touchée se résout en `''`. Tous deux passent
   inchangés dans `withProfileDefaults`.
4. **Aucun changement de scoring.** Ce changement ajoute un signal collecté ; il
   ne modifie ni `relevance.ts`, ni `location-matching.ts`, ni
   `DEFAULT_SCORING_WEIGHTS`.
5. **`canSubmit` inchangé.** La soumission exige toujours `firstName`,
   `jobTitle` et ≥ 1 mot-clé. Le mode de travail et la localisation restent
   optionnels.

## Cas limites et migration

- **Profils existants** stockés avec `remote: 'any'` (la seule valeur que
  l'onboarding pouvait produire jusqu'ici) : inchangés. Aucune migration DB,
  aucun changement de préprocesseur.
- **L'utilisateur sélectionne « Indifférent »** : `remote === 'any'` — identique
  au comportement codé en dur actuel ; le scoring le traite comme « aucune
  préférence de télétravail ».
- **Localisation laissée vide, mode de travail choisi** : valide ; le poids
  remote s'applique toujours, le poids localisation contribue 0 pour ce profil
  (comportement existant).
- **Remplissage automatique navigateur / noms de villes longs**
  (« Charenton-le-Pont ») : le champ texte ne doit pas tronquer ; le style de
  saisie existant le gère déjà.
- **Sélection clavier** du contrôle segmenté : chaque option est un véritable
  `<button>` avec `aria-pressed`, atteignable via Tab, activable via Espace /
  Entrée — la navigation clavier d'abord est un principe d'accessibilité affirmé.

## Correspondance UI

- Champ **Localisation** : le placeholder passe de `ex: Paris ou remote` à un
  exemple de lieu uniquement (p. ex. `Paris, Lyon, Bordeaux…`). Le libellé reste
  `Localisation souhaitée`.
- Champ **Mode de travail** : nouveau, placé immédiatement après Localisation
  (regroupement où → comment). Contrôle segmenté, 4 options, pleine largeur,
  défaut `Indifférent`. Réutilise le vocabulaire existant de puces / sélection
  du wizard et l'accent `blueprint-blue` afin qu'il s'intègre à la même surface,
  sans nouvelle bibliothèque de composants.
- Les deux champs conservent le style de saisie d'onboarding existant (bordure,
  anneau de focus, rayon) — aucun nouveau token de design.

## Hors périmètre

- Sélecteur de localisation structuré (datalist / géocodage). La localisation
  reste en texte libre ; `location-matching.ts` normalise déjà les synonymes et
  aires métropolitaines.
- Modification du vocabulaire de `ProfileSection` ou `FilterBar`.
- Ajout de `remote` aux préférences d'alertes connectées (les alertes reposent
  aujourd'hui sur TJM + stack).
- Réorganisation des étapes d'onboarding ou modification du tour en 5 étapes.
