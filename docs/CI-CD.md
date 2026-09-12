# Pipeline CI/CD MissionPulse

Ce document décrit le pipeline CI/CD du monorepo MissionPulse.

## Structure du monorepo

```
pulse/
├── apps/extension/   # Extension Chrome (tests, build)
├── apps/landing/     # Landing page statique (pas de CI nécessaire)
└── packages/tsconfig # Config TypeScript partagée
```

Tous les jobs CI s'exécutent dans le workspace `apps/extension/` via Turborepo.

## Vue d'ensemble

MissionPulse utilise GitHub Actions pour l'intégration continue et le déploiement. Le pipeline se compose de deux workflows principaux :

| Workflow      | Déclencheur        | Rôle                                       |
| ------------- | ------------------ | ------------------------------------------ |
| `ci.yml`      | Push sur main, PRs | Lint, test, build, couverture              |
| `release.yml` | Tags Git (`v*`)    | Build, package, publication de l'extension |

## Workflows

### 1. Workflow CI (`ci.yml`)

S'exécute à chaque push sur `main` et sur toutes les pull requests.

**Jobs :**

```
┌─────────────────────────────────────────────────────────────┐
│                     Pipeline CI                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  setup ──► lint ──┐                                         │
│           │        │                                         │
│           └──► format ─┼──► test ──┬──► build                    │
│           │              │         └──► test-e2e (PRs uniquement) │
│           └──► typecheck ┘                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

| Job         | Description                          |
| ----------- | ------------------------------------ |
| `setup`     | Calcule le chemin du cache pnpm      |
| `lint`      | Exécute ESLint sur tous les fichiers |
| `format`    | Vérifie le formatage Prettier        |
| `typecheck` | Vérification TypeScript strict       |
| `test`      | Tests unitaires avec couverture      |
| `build`     | Build de l'artefact extension        |
| `test-e2e`  | Tests E2E (PRs uniquement)           |

**Fonctionnalités :**

- Cache pnpm pour des installations plus rapides
- Upload de couverture vers Codecov
- Groupes de concurrence pour annuler les anciens runs
- Tests E2E uniquement sur les PRs (optimisation de coût)
- E2E s'exécute en parallèle de `build` (aucun artefact extension requis)
- E2E bootstrappe `@pulse/ui` via `pnpm --filter @pulse/extension test:e2e`
- La CI exclut les tests `@slow` (performance, offline) ; lancer `pnpm test:e2e:full` en local pour la suite complète

### 2. Workflow Release (`release.yml`)

Déclenché par le push d'un tag de version sémantique (ex. `v1.0.0`).

**Processus :**

```
┌─────────────────────────────────────────────────────────────┐
│                   Pipeline de release                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Extraction de la version depuis le tag                   │
│  2. Vérification de la validité de manifest.json             │
│  3. Bump de version dans package.json & manifest.json        │
│  4. Build de l'extension en production                       │
│  5. Création de l'artefact ZIP                               │
│  6. Génération du changelog depuis l'historique git          │
│  7. Création de la GitHub Release avec le ZIP attaché        │
│  8. Publication au Chrome Web Store (si identifiants définis)│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Format de version :**

- Stable : `v1.0.0` → publiée sur le CWS
- Pré-release : `v1.0.0-beta.1` → GitHub Release uniquement (CWS ignoré)

## Configuration des identifiants

### Secrets requis

Configurer ces secrets dans les réglages du dépôt GitHub :

| Secret                 | Requis pour          | Comment l'obtenir                |
| ---------------------- | -------------------- | -------------------------------- |
| `CODECOV_TOKEN`        | Upload de couverture | [codecov.io](https://codecov.io) |
| `CHROME_CLIENT_ID`     | Publication CWS      | API Chrome Web Store             |
| `CHROME_CLIENT_SECRET` | Publication CWS      | API Chrome Web Store             |
| `CHROME_REFRESH_TOKEN` | Publication CWS      | API Chrome Web Store             |
| `CHROME_EXTENSION_ID`  | Publication CWS      | L'ID de votre extension          |

### Configuration de la publication Chrome Web Store

1. **Créer les identifiants OAuth :**
   - Aller sur la [Google Cloud Console](https://console.cloud.google.com)
   - Créer un client ID OAuth 2.0
   - Ajouter l'URI de redirection autorisée : `https://oauth2.googleapis.com/token`
   - Noter le Client ID et le Client Secret

2. **Obtenir le refresh token :**
   - Utiliser l'[API Chrome Web Store](https://developer.chrome.com/docs/webstore/using-the-api)
   - Suivre le flux OAuth pour obtenir le refresh token

3. **Obtenir l'extension ID :**
   - Visible dans le tableau de bord développeur du Chrome Web Store
   - Format : `abcdefghijklmnopqrstuvwxyzabcdef`

4. **Ajouter les secrets à GitHub :**
   - Aller dans Settings du repo → Secrets and variables → Actions
   - Ajouter chaque secret individuellement

### Configuration optionnelle

Pour ignorer la publication Chrome Web Store, il suffit de ne pas configurer les secrets CWS. Le workflow loguera un avertissement mais continuera avec succès.

## Développement local

### Scripts de build

```bash
# Build production
pnpm build

# Build avec bump de version
./scripts/build-extension.sh 1.0.0

# Vérifier manifest.json
pnpm tsx scripts/verify-manifest.ts

# Bump de version uniquement
pnpm tsx scripts/bump-version.ts 1.0.0
```

### Créer une release

```bash
# 1. S'assurer d'être sur main
git checkout main
git pull

# 2. Créer et pousser le tag
git tag v1.0.0
git push origin v1.0.0

# 3. Surveiller le workflow
gh run watch
```

### Déclencheurs manuels de workflow

```bash
# Déclencher la CI manuellement
gh workflow run ci.yml
```

## Outils de qualité de code

### ESLint

Configuration : `.eslintrc.cjs`

```bash
# Lancer le lint
pnpm lint

# Corriger les problèmes auto-corrigibles
pnpm lint:fix
```

**Règles clés :**

- Pas de types `any`
- Isolement du Functional Core (pas d'imports shell depuis core)
- Application des runes Svelte 5
- Pas de stores Svelte (utiliser les runes $state)

### Prettier

Configuration : `.prettierrc`

```bash
# Vérifier le formatage
pnpm format:check

# Corriger le formatage
pnpm format
```

### TypeScript

Configuration : `tsconfig.json` (mode strict)

```bash
# Vérification des types
pnpm tsc --noEmit
```

## Rapports de couverture

La couverture est automatiquement uploadée vers Codecov à chaque run CI.

- **Badge :** à ajouter au README : `![coverage](https://codecov.io/gh/your-org/pulse/branch/main/graph/badge.svg)`
- **Rapports :** rapports détaillés sur codecov.io

## Dépannage

### Échec CI : « pnpm install failed »

- Vérifier que `pnpm-lock.yaml` est commité
- Lancer `pnpm install` en local et committer les changements

### Échec CI : « TypeScript error »

- Lancer `pnpm tsc --noEmit` en local
- Corriger les erreurs de types avant de pousser

### Échec Release : « Chrome Web Store publish failed »

- Vérifier que tous les secrets CWS sont correctement définis
- Vérifier que le refresh token n'a pas expiré
- S'assurer que l'extension ID est correct

## Sécurité

- Tous les secrets sont masqués dans les logs
- Aucun identifiant dans le code ou les commentaires
- Les permissions des workflows suivent le principe du moindre privilège
- Les actions tierces sont épinglées à des versions spécifiques
