# Surface Feature Flags — modèle de feature flipping

> **Statut : actif.** Source de vérité pour le feature flipping des surfaces
> de l'extension (onglets + couche connectée) et l'alignement du discours de
> la landing. Remplace la règle implicite « toutes les pages toujours
> visibles » pour la navigation. Le flag premium historique
> (`premium-feature-flag.model.md`) reste indépendant : il gouverne le gating
> freemium, pas la disponibilité des surfaces.

## 1. Périmètre et clés

Chaque surface flippable est identifiée par une clé pure, partagée par
l'extension et la landing via `@pulse/domain`
(`packages/domain/src/feature-flags.ts`) :

| Clé            | Surface extension                                                                                                                                           | Landing associée                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `feed`         | Onglet Missions                                                                                                                                             | « Feed unique, 4 plateformes dédupliquées » |
| `profile`      | Onglet Profil                                                                                                                                               | « Assistant profil »                        |
| `cv`           | Onglet CV                                                                                                                                                   | « Assistant CV »                            |
| `applications` | Onglet Suivi (pipeline de candidatures)                                                                                                                     | « Suivi de candidatures »                   |
| `tjm`          | Onglet TJM (radar)                                                                                                                                          | « Radar TJM par stack »                     |
| `settings`     | Onglet Réglages                                                                                                                                             | —                                           |
| `connected`    | Couche connectée : section « Compte et synchronisation » des Réglages, chargement du compte extension (`loadConnectedAccount`), surfaces de synchronisation | « Dashboard connecté », mentions de sync    |

**Onboarding n'est pas un onglet** : jamais gated, c'est le chemin de
bootstrap (`resolveInitialPage`).

## 2. Configuration de lancement

```ts
EXTENSION_SURFACE_FLAGS = {
  feed: true,
  profile: true,
  cv: true,
  applications: false, // suivi de candidatures — désactivé au lancement
  tjm: true,
  settings: true,
  connected: false, // dashboard connecté / sync — désactivé au lancement
};
```

La constante vit dans `@pulse/domain` (pur, zéro I/O). L'extension et la
landing consomment la **même constante** : aucune duplication.

## 3. Machine de navigation (états, événements, transitions)

La navigation extension (`app-navigation.svelte.ts`) est contrainte par les
flags. Le domaine d'états est :

```text
pages navigables = { onboarding } ∪ { onglets enabled }
page courante ∈ pages navigables
```

Événements et transitions :

| Événement                                                                                                                         | Garde           | Transition                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| `NAVIGATE(page)` (interaction directe : pilule de nav)                                                                            | `page` enabled  | `currentPage ← page` (respecte la direction)                                                                    |
| `NAVIGATE(page)` (interaction directe : pilule de nav)                                                                            | `page` disabled | **No-op interdit de franchir** (aucun changement)                                                               |
| `NAVIGATE_INTERNAL(page)` (flux applicatifs : retour au feed depuis Réglages/TJM/Suivi, `onNavigateToProfile`, clic notification) | `page` enabled  | `currentPage ← page`                                                                                            |
| `NAVIGATE_INTERNAL(page)`                                                                                                         | `page` disabled | `currentPage ← resolveFallbackTab(flags)` — un flux interne ne peut jamais laisser l'utilisateur muet sur place |
| `BOOTSTRAP` (profile/flags lus)                                                                                                   | —               | `onboarding` si non complété, sinon onglet de repli                                                             |
| `COMPLETE_ONBOARDING`                                                                                                             | —               | `currentPage ← resolveFallbackTab(flags)`                                                                       |
| `PROFILE_UPDATED` (message)                                                                                                       | —               | `hasCompletedOnboarding ← true` (sans navigation)                                                               |

Deux commandes distinctes dans `app-navigation.svelte.ts` :

- `navigate(page)` : garde stricte, no-op si `page` est disabled. C'est la
  commande des **interactions utilisateur directes** (pilules de navigation —
  qui de toute façon ne listent que les onglets enabled).
- `navigateWithFallback(page)` : commande des **destinations sémantiques
  internes** (deep-link notification, `onBack` des pages, liens croisés
  inter-pages). Une cible disabled résout vers le repli plutôt qu'un no-op :
  ces appels viennent de l'application elle-même, jamais d'une tentative
  utilisateur d'atteindre un onglet masqué.

Le repli est calculé par la fonction pure `resolveFallbackTab` :

```text
resolveFallbackTab(flags) = feed si feed enabled
                          sinon premier onglet enabled (ordre EXTENSION_TAB_ORDER)
                          sinon feed (garde pour cartes de flags brutes,
                          hors normalisation)
```

Normalisation amont : `resolveSurfaceFlags` réactive `feed` si les overrides
désactivent **tous** les onglets — la carte de flags résultante ne peut jamais
être « tout off ». Le `?? 'feed'` final de `resolveFallbackTab` ne couvre que
les cartes brutes qui contourneraient la normalisation.

### Surfaces dérivées de l'état des flags

| Surface                                | `enabled`                                                                  | `disabled`                                                      |
| -------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Item de navigation                     | Visible                                                                    | Absent de la barre                                              |
| Préchargement lazy (`App.svelte`)      | Préchargé                                                                  | Jamais importé                                                  |
| `NAVIGATE` / page courante             | Autorisé                                                                   | No-op ; une page courante devenue disabled retombe sur le repli |
| Réglages « Compte et synchronisation » | Section rendue, `loadConnectedAccount()` appelé                            | Section absente, **aucun appel** `loadConnectedAccount()`       |
| Deep-link notification                 | Non affecté (cible le feed uniquement — `notification-deep-link.model.md`) | Idem                                                            |

## 4. Invariants

1. **Pureté** : les flags et leurs résolveurs sont purs (pas de `fetch`, de
   `Date.now()`, d'I/O, de LLM). La constante `@pulse/domain` est la seule
   source de vérité production.
2. **Aucune transition pilotée par LLM** : les flags sont des booléens
   statiques ; aucune IA ne décide d'une visibilité.
3. **Repli garanti** : `resolveFallbackTab` renvoie toujours une page
   rendable ; la configuration ne peut jamais vider la navigation.
4. **Onboarding jamais gated** : la clé n'existe pas dans le type
   `ExtensionSurfaceFeature`.
5. **Override dev uniquement** : production lit la constante ; seul le dev
   (DevPanel → `localStorage` JSON, clé `__missionpulse_dev_surface_flags`)
   peut surcharger, avec coercion booléenne stricte
   (`resolveSurfaceFlags` : la chaîne `'false'` n'active jamais rien).
6. **Un onglet désactivé ne charge rien** : ni import dynamique, ni effet de
   bord de sa page (les stores liés ne bootstrappent pas).
7. **Cohérence extension ↔ landing** : la landing dérive son `featureMatrix`
   et ses copies de la même constante (voir
   `apps/landing/src/models/landing-feature-positioning.model.md`). Une
   capacité `disabled` ne peut jamais être étiquetée `free` ni présentée
   comme livrée : elle est omise ou marquée « à venir ». Cela couvre aussi
   les **CTA de compte** : quand `connected` est disabled, aucun lien vers
   `/register` ou `/dashboard` n'est rendu — les CTA « Créer mon compte
   Premium » et « Gérer mon compte et mes crédits » deviennent des
   placeholders inertes « bientôt disponible » (`aria-disabled`).
8. **Le flag premium historique reste orthogonal** : `applications: true` +
   `PREMIUM_FEATURE_ENABLED: true` reste nécessaire pour un gating freemium
   du Suivi ; ce modèle ne gère que la disponibilité.

## 5. Ce que ce modèle ne fait pas (deferred)

- Remote config / feature flipping serveur (v1 = constante build-time).
- UI de toggling en production (DevPanel uniquement).
- Gating granulaire intra-page (ex. masquer une seule carte du feed).

## 5 bis. Dev, QA et e2e

- Le dev démarre sur la **configuration de lancement** (même source de vérité
  que la production — pas de divergence silencieuse).
- Le DevPanel expose un toggle par surface + un preset « Tout activer » ;
  l'override est persisté dans `localStorage`
  (`__missionpulse_dev_surface_flags`, JSON) et appliqué au rechargement
  (même pattern que les scénarios premium et la seed QA).
- Les tests e2e qui exercistent un onglet désactivé au lancement (ex.
  `applications-pipeline`) seedent l'override via `page.addInitScript`
  avant le chargement du side panel — pattern déjà utilisé pour
  `__missionpulse_dev_missions` / `__missionpulse_dev_profile`.
- `resolveFallbackTab` s'applique aussi au bootstrap
  (`resolveInitialPage`) : si `feed` est désactivé, la page initiale est le
  repli, jamais une page non rendable.
- Les tests e2e **packagés** (build production, pas de stubs DEV : l'override
  `localStorage` ne peut pas activer un onglet disabled) dérivent la liste
  des surfaces traversées de la même constante
  (`EXTENSION_TAB_ORDER` filtré par `EXTENSION_SURFACE_FLAGS`) — jamais
  d'une liste statique qui divergerait des flags de lancement.

## 6. Vérifications attendues (Verify)

- Tests unitaires purs : `resolveSurfaceFlags` (coercion, fallback,
  normalisation « jamais tout off »), `resolveFallbackTab` (feed off, tout
  off), `isTabEnabled`.
- Tests de navigation : `NAVIGATE` vers un onglet disabled = no-op strict ;
  `NAVIGATE_INTERNAL` vers un onglet disabled = repli ; complétion
  d'onboarding aboutit sur le repli.
- Test d'alignement landing : aucune ligne `tier: 'free'` pour une clé
  disabled ; lignes `soon` uniquement pour clés disabled ; CTA de compte
  gated par `connectedLive`.
- Le LLM ne décide aucune transition : rien à tester au-delà de la
  staticité des constantes (garantie par le typage).
