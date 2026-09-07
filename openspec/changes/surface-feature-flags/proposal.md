# Surface Feature Flags — proposal

## Pourquoi

Le lancement ne doit pas activer le suivi de candidatures ni le dashboard
connecté, et l'équipe veut pouvoir activer/désactiver chaque onglet de
l'extension sans toucher au code de navigation. La landing doit porter un
discours raccord avec les fonctionnalités réellement livrées.

## Quoi

- Constante partagée `EXTENSION_SURFACE_FLAGS` dans `@pulse/domain`
  (`packages/domain/src/feature-flags.ts`) : une clé par onglet
  (`feed`, `profile`, `cv`, `applications`, `tjm`, `settings`) + une clé
  `connected` pour la couche connectée. Lancement :
  `applications: false`, `connected: false`, tout le reste `true`.
- Modèle autoritatif :
  `apps/extension/src/models/surface-feature-flags.model.md`
  (états, événements, gardes de navigation, invariants, repli).
- Extension : `core/features/flags.ts` wrappe la constante partagée ;
  `features.svelte.ts` expose les flags runtime (override dev via
  localStorage) ; `app-navigation.svelte.ts` refuse `NAVIGATE` vers un onglet
  désactivé et calcule le repli ; `App.svelte` filtre la nav et le
  préchargement ; `SettingsPage` masque la section connectée et n'appelle
  plus `loadConnectedAccount()` quand `connected: false`.
- Landing : `featureMatrix`, cartes de plan et copies dérivées de la même
  constante ; une capacité désactivée devient `soon` (« À venir ») ou est
  retirée, jamais `free`.
- DevPanel : toggles par surface (rechargement pour appliquer, même pattern
  que les scénarios premium).

## Impact

- Modifiés : `packages/domain/src/index.ts`,
  `apps/extension/src/lib/core/features/flags.ts`,
  `apps/extension/src/lib/state/features.svelte.ts`,
  `apps/extension/src/lib/state/app-navigation.svelte.ts`,
  `apps/extension/src/sidepanel/App.svelte`,
  `apps/extension/src/ui/pages/SettingsPage.svelte` (+ orchestrateur
  settings-page), `apps/extension/src/dev/DevPanel.svelte`,
  `apps/landing/src/routes/+page.svelte`,
  `apps/landing/src/models/landing-feature-positioning.model.md`.
- Nouveaux tests : `packages/domain` (resolvers), extension navigation
  (gardes + repli), alignement landing.

## Risques et non-buts

- Non-but : remote config serveur, gating intra-page, suppression du code
  des onglets désactivés (il reste derrière le flag).
- Risque couvert : une config vide ne doit jamais priver l'extension de page
  rendable (`resolveFallbackTab` garanti par test).
