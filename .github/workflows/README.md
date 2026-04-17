# GitHub Workflows

This directory contains all GitHub Actions workflows for MissionPulse.

## Workflows Overview

| File | Name | Trigger | Purpose |
|------|------|---------|---------|
| `ci.yml` | CI | Push, PR | Continuous integration |
| `release.yml` | Release | Tags `v*` | Build & publish releases |
| `connector-health.yml` | Connector Health | Cron, Manual | Monitor connector status |

## Detailed Documentation

See [docs/CI-CD.md](../../docs/CI-CD.md) for complete documentation.

## Quick Reference

### Trigger CI manually

```bash
gh workflow run ci.yml
```

### Create a release

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Run connector health check

```bash
gh workflow run connector-health.yml
```

### Run health check for specific connectors

```bash
gh workflow run connector-health.yml -f connectors=freework,lehibou
```

## Workflow Files

### ci.yml

**Triggers:**
- Push to `develop` and `main`
- Pull requests targeting `develop` and `main`
- Manual dispatch

**Jobs:**
1. `setup` - Compute cache paths
2. `lint` - ESLint
3. `format` - Prettier check
4. `typecheck` - TypeScript
5. `test` - Vitest with coverage
6. `build` - Vite build, built manifest verification, ZIP artifact
7. `test-e2e` - Playwright (PRs only)

**Concurrency:** Previous runs on same branch are cancelled.

---

### release.yml

**Triggers:**
- Tags matching `v*.*.*` (e.g., `v1.0.0`, `v2.1.0-beta.1`)

**Jobs:**
1. `build-and-release` - Typecheck, test, build, verify built manifest, ZIP, GitHub Release
2. `publish-to-chrome-store` - CWS publish (stable only)

**Pre-releases:** Tags with `-` (e.g., `v1.0.0-beta.1`) skip CWS publish.

**Required Secrets:**
- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`
- `CHROME_EXTENSION_ID`

---

### connector-health.yml

**Triggers:**
- Schedule: Daily at 8:00 UTC
- Manual dispatch

**Inputs:**
- `connectors` - Comma-separated connector names (optional)
- `skip_issue` - Skip GitHub Issue creation (default: false)

**Job:**
1. `health-check` - Run connector tests
2. `notify-success` - Log success (scheduled only)

**Failure Handling:**
Creates/updates GitHub Issue with failure details.

## Permissions

| Workflow | Permissions |
|----------|-------------|
| ci.yml | `contents: read` |
| release.yml | `contents: write` |
| connector-health.yml | `contents: read`, `issues: write` |

## Actions Used

| Action | Version | Purpose |
|--------|---------|---------|
| `actions/checkout` | v4 | Git checkout |
| `actions/setup-node` | v4 | Node.js setup |
| `pnpm/action-setup` | v4 | pnpm setup |
| `actions/cache` | v4 | Dependency cache |
| `actions/upload-artifact` | v4 | Artifact upload |
| `actions/download-artifact` | v4 | Artifact download |
| `codecov/codecov-action` | v4 | Coverage upload |
| `softprops/action-gh-release` | v2 | GitHub releases |
| `mnao305/chrome-extension-upload` | v5.0.0 | CWS publish |
| `JasonEtco/create-an-issue` | v2 | Issue creation |

## Issue Templates

### connector-failure.md

Used by `connector-health.yml` to create issues when health checks fail.

Variables:
- `{{ env.DATE }}` - Failure date
- `{{ env.FAILED_CONNECTORS }}` - List of failed connectors
- `{{ env.RUN_URL }}` - Link to workflow run
