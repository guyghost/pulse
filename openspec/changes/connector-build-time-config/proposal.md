# Proposal: Build-time connector toggling

## Why — Produit

Certains connecteurs (aujourd'hui **Malt** et **Collective**) fonctionnent mal :
scraping cassé, DOM instable, faux positifs. Tant qu'ils restent compilés dans
le package, ils polluent le feed, réclament des `host_permissions` que Chrome
affiche à l'installation, et peuvent être réactivés par des réglages persistés
stales.

On veut pouvoir, **au moment de produire le package**, signifier quels
connecteurs embarquer — via un fichier de config par défaut + variables
d'environnement pour les builds ponctuels (CI, variantes).

## Décision (confirmée produit)

**Fichier de config + variables d'environnement (override).**

1. `apps/extension/connectors.config.json` — source de vérité par défaut,
   versionnée. Shape : `{ "include": string[]?, "exclude": string[]? }`.
   Par défaut : `{ "exclude": ["malt", "collective"] }`.
2. Variables d'environnement **`CONNECTORS_INCLUDE`** / **`CONNECTORS_EXCLUDE`**
   (listes d'IDs séparées par `,`). L'env **gagne** sur le fichier.

L'algorithme de résolution est pur et déterministe :

- un `include` non-vide (env **ou** fichier) détermine **entièrement** la sortie ;
- sinon, `exclude` (env **ou** fichier) soustrait du catalogue complet ;
- sinon → catalogue complet.

Règle courte : **include l'emporte sur exclude ; env l'emporte sur fichier.**

## Source de vérité

`apps/extension/src/models/connector-build-config.model.md` — modèle
autoritatif (états, invariants, algorithme de résolution, câblage, plan de
test). Cette proposal ne le duplique pas.

## What Changes

### Build-time

- **`scripts/resolve-connectors.ts`** — résolveur pur
  `resolveIncludedConnectors({ allIds, config, env })` + wrapper I/O
  `loadConnectorConfig()`. Utilisable par `vite.config.ts`, `verify-manifest`,
  les scripts de packaging.
- **`vite.config.ts`** — `defineConfig(({ command }) => …)` :
  - ne lit `connectors.config.json` **qu'en mode `build`** (dev/test gardent le
    catalogue complet pour des assertions déterministes) ;
  - filtre `manifest.host_permissions` : un pattern est conservé s'il appartient
    à un connecteur inclus **ou** n'appartient à aucun connecteur (infra :
    Supabase, missionpulse.app) ;
  - injecte `__PULSE_INCLUDED_CONNECTORS__` comme constante compile-time.

### Runtime

- **`src/lib/shell/connectors/build-config.ts`** — accessoir single source of
  truth. Lit `__PULSE_INCLUDED_CONNECTORS__` via garde `typeof` (fallback sur le
  catalogue complet si le define est absent → dev/test).
- **`src/lib/shell/connectors/meta.ts`** — `getConnectorsMeta()` filtre via
  `INCLUDED_CONNECTOR_IDS` ; `getAllConnectorsMeta()` (non filtré) pour les
  outils de build. `filterConnectorsByIncluded()` exporté et pur (testable).
  Ajout de `hostPermissions` au `ConnectorMeta`.
- **`src/lib/shell/connectors/index.ts`** — `getConnectorIds()` et
  `getConnector()` (retourne `null` pour un connecteur exclu) filtrent via
  `INCLUDED_SET`. `isConnectorIncluded()` exposé.
- **`src/lib/shell/storage/chrome-storage.ts`** —
  `DEFAULT_SETTINGS.enabledConnectors` dérive de `INCLUDED_CONNECTOR_IDS` ;
  `getSettings()` intersecte les réglages persistés avec l'ensemble inclus
  (évite qu'un réglage stale réactive un connecteur exclu).

### Vérification

- **`scripts/verify-manifest.ts`** — `validateHostPermissionCoverage()` (mode
  source : tout connecteur a un pattern correspondant) +
  `validateNoExcludedConnectorPatterns()` (mode build filtré : aucun pattern
  d'un connecteur exclu ne fuite).

## Invariants clés

1. **Exclu = invisible** : un connecteur exclu disparaît du `host_permissions`,
   du catalogue UI, du registry scanner, et des défauts réglages.
2. **Single source of truth** : la résolution se fait une seule fois (build),
   injectée comme constante. Aucun runtime re-parse la config.
3. **Déterminisme** : le résolveur est pur — même `{ allIds, config, env }` →
   même sortie. Dev/test ignorent le fichier de config (le define est absent →
   fallback catalogue complet).
4. **Least-privilege** : les `host_permissions` des connecteurs exclus ne sont
   pas inclus dans le manifest produit → Chrome ne les demande pas à
   l'installation.
5. **Pas de stockage de credentials** : aucun impact (on ne fait que cacher des
   connecteurs). Les sessions navigateur existantes restent utilisées.

## Cas limites couverts

- Fichier de config manquant/invalide → config vide (ship tout).
- Aucun connecteur inclus → warning build, manifeste valide, scanner inerte.
- IDs inconnus dans la config → ignorés + warning.
- Réglages utilisateur persistés référençant un connecteur depuis exclu →
  sanitize silencieux dans `getSettings()`.
- `host_permissions` non possédés par un connecteur (infra) → toujours conservés.

## Test plan

- 22 tests unitaires pour le résolveur pur (include/exclude/env/fichier/edge cases).
- 9 tests pour le catalogue (`filterConnectorsByIncluded`, `getConnectorsMeta`).
- 2 tests pour l'accessor runtime (env de test → fallback catalogue complet).
- 2 tests pour `DEFAULT_SETTINGS.enabledConnectors`.
- 45 tests pour `verify-manifest` (couverture source + build filtré).
- Build smoke test : config par défaut / `CONNECTORS_EXCLUDE=malt` /
  `CONNECTORS_INCLUDE=free-work,lehibou` → `host_permissions` correctement
  filtrés et `INCLUDED_CONNECTOR_IDS` inliné dans le bundle.

## Statut

Implémenté et vérifié. 131 fichiers de test / 1876 tests passent ; typecheck
vert ; build des 3 modes validé.
