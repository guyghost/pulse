# MissionPulse CI/CD Pipeline

This document describes the complete CI/CD pipeline for the MissionPulse Chrome extension.

## Overview

MissionPulse uses GitHub Actions for continuous integration and deployment. The pipeline consists of three main workflows:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push to main, PRs | Lint, test, build, coverage |
| `release.yml` | Git tags (`v*`) | Build, package, publish extension |
| `connector-health.yml` | Daily cron (8h UTC) | Monitor connector health |

## Workflows

### 1. CI Workflow (`ci.yml`)

Runs on every push to `main` and on all pull requests.

**Jobs:**

```
┌─────────────────────────────────────────────────────────────┐
│                     CI Pipeline                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  setup ──► lint ──┐                                         │
│           │        │                                         │
│           └──► format ─┼──► test ──► build ──► test-e2e     │
│           │              │                                   │
│           └──► typecheck ┘                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

| Job | Description |
|-----|-------------|
| `setup` | Compute pnpm cache path |
| `lint` | Run ESLint on all files |
| `format` | Check Prettier formatting |
| `typecheck` | TypeScript strict mode check |
| `test` | Run unit tests with coverage |
| `build` | Build extension artifact |
| `test-e2e` | Run E2E tests (PRs only) |

**Features:**
- pnpm cache for faster installs
- Coverage upload to Codecov
- Concurrency groups to cancel old runs
- E2E tests only on PRs (cost optimization)

### 2. Release Workflow (`release.yml`)

Triggered by pushing a semantic version tag (e.g., `v1.0.0`).

**Process:**

```
┌─────────────────────────────────────────────────────────────┐
│                   Release Pipeline                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Extract version from tag                                 │
│  2. Verify manifest.json validity                            │
│  3. Bump version in package.json & manifest.json             │
│  4. Build production extension                               │
│  5. Create ZIP artifact                                      │
│  6. Generate changelog from git history                      │
│  7. Create GitHub Release with ZIP attached                  │
│  8. Publish to Chrome Web Store (if credentials set)         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Version Format:**
- Stable: `v1.0.0` → Published to CWS
- Pre-release: `v1.0.0-beta.1` → GitHub Release only (skips CWS)

### 3. Connector Health Workflow (`connector-health.yml`)

Runs daily at 8:00 AM UTC to verify all connectors are still working.

**Process:**

```
┌─────────────────────────────────────────────────────────────┐
│              Connector Health Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Run health check tests for all connectors                │
│  2. Parse test results                                       │
│  3. If any connector failed:                                 │
│     - Create/update GitHub Issue                             │
│     - Fail workflow                                          │
│  4. If all passed:                                           │
│     - Log success                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Manual Trigger:**
```bash
gh workflow run connector-health.yml
```

**Specific Connectors:**
```bash
gh workflow run connector-health.yml -f connectors=freework,lehibou
```

## Credentials Setup

### Required Secrets

Configure these secrets in your GitHub repository settings:

| Secret | Required For | How to Obtain |
|--------|--------------|---------------|
| `CODECOV_TOKEN` | Coverage upload | [codecov.io](https://codecov.io) |
| `CHROME_CLIENT_ID` | CWS publish | Chrome Web Store API |
| `CHROME_CLIENT_SECRET` | CWS publish | Chrome Web Store API |
| `CHROME_REFRESH_TOKEN` | CWS publish | Chrome Web Store API |
| `CHROME_EXTENSION_ID` | CWS publish | Your extension ID |

### Setting Up Chrome Web Store Publishing

1. **Create OAuth Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create OAuth 2.0 client ID
   - Add authorized redirect URI: `https://oauth2.googleapis.com/token`
   - Note the Client ID and Client Secret

2. **Get Refresh Token:**
   - Use the [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-the-api)
   - Follow OAuth flow to obtain refresh token

3. **Get Extension ID:**
   - Found in your Chrome Web Store developer dashboard
   - Format: `abcdefghijklmnopqrstuvwxyzabcdef`

4. **Add Secrets to GitHub:**
   - Go to repo Settings → Secrets and variables → Actions
   - Add each secret individually

### Optional Configuration

To skip Chrome Web Store publishing, simply don't configure the CWS secrets. The workflow will log a warning but continue successfully.

## Local Development

### Build Scripts

```bash
# Build for production
pnpm build

# Build with version bump
./scripts/build-extension.sh 1.0.0

# Verify manifest.json
pnpm tsx scripts/verify-manifest.ts

# Bump version only
pnpm tsx scripts/bump-version.ts 1.0.0
```

### Creating a Release

```bash
# 1. Ensure you're on main
git checkout main
git pull

# 2. Create and push tag
git tag v1.0.0
git push origin v1.0.0

# 3. Monitor workflow
gh run watch
```

### Manual Workflow Triggers

```bash
# Trigger CI manually
gh workflow run ci.yml

# Trigger connector health check
gh workflow run connector-health.yml

# Trigger connector health for specific connectors
gh workflow run connector-health.yml -f connectors=freework

# Skip issue creation (only log results)
gh workflow run connector-health.yml -f skip_issue=true
```

## Code Quality Tools

### ESLint

Configuration: `.eslintrc.cjs`

```bash
# Run linting
pnpm lint

# Fix auto-fixable issues
pnpm lint:fix
```

**Key Rules:**
- No `any` types
- Functional Core isolation (no shell imports from core)
- Svelte 5 runes enforcement
- No Svelte stores (use $state runes)

### Prettier

Configuration: `.prettierrc`

```bash
# Check formatting
pnpm format:check

# Fix formatting
pnpm format
```

### TypeScript

Configuration: `tsconfig.json` (strict mode)

```bash
# Type check
pnpm tsc --noEmit
```

## Coverage Reports

Coverage is automatically uploaded to Codecov on every CI run.

- **Badge:** Add to README: `![coverage](https://codecov.io/gh/your-org/pulse/branch/main/graph/badge.svg)`
- **Reports:** View detailed reports at codecov.io

## Troubleshooting

### CI Fails: "pnpm install failed"

- Check `pnpm-lock.yaml` is committed
- Run `pnpm install` locally and commit changes

### CI Fails: "TypeScript error"

- Run `pnpm tsc --noEmit` locally
- Fix type errors before pushing

### Release Fails: "Chrome Web Store publish failed"

- Verify all CWS secrets are set correctly
- Check refresh token hasn't expired
- Ensure extension ID is correct

### Connector Health Check Fails

- Check the GitHub Issue for details
- Review the workflow run logs
- Run health checks locally: `pnpm vitest run tests/health`

## Security

- All secrets are masked in logs
- No credentials in code or comments
- Workflow permissions use least-privilege principle
- Third-party actions are pinned to specific versions
