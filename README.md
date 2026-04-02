# MissionPulse

**Chrome Extension for freelance tech professionals.** Centralized mission feed with AI-powered relevance scoring and TJM analysis.

> Your freelance radar. One feed, all platforms, scored for you.

## Features

- **Centralized Feed** — Aggregate missions from 5 freelance platforms in one place
- **AI Relevance Scoring** — Gemini Nano (Chrome built-in AI) analyzes semantic fit between your profile and missions
- **Smart Scoring** — Weighted scoring based on stack match, location, TJM range, and remote preferences
- **Deduplication** — Automatically detects and merges duplicate missions across platforms
- **TJM Dashboard** — Track daily rate trends across sources with visual gauges
- **Favorites** — Bookmark missions for later review
- **Offline Support** — Works without network using cached data (IndexedDB + chrome.storage)
- **Export** — Download your missions as JSON for external tools
- **Keyboard Shortcuts** — Fast navigation and actions without leaving the keyboard
- **Backup & Restore** — Export and import your profile and data

### Supported Platforms

| Platform                                  | Status    |
| ----------------------------------------- | --------- |
| [FreeWork](https://www.free-work.com)     | Supported |
| [LeHibou](https://www.lehibou.com)        | Supported |
| [Hiway](https://hiway-missions.fr)        | Supported |
| [Collective](https://www.collective.work) | Supported |
| [Cherry Pick](https://app.cherry-pick.io) | Supported |

## Quick Start

```bash
# Prerequisites: Node.js >= 22, pnpm >= 10

# Install dependencies
pnpm install

# Start dev server (UI only, no Chrome needed)
pnpm dev

# Run unit tests
pnpm test
```

Then open `http://localhost:5173/src/sidepanel/index.html` in your browser. In dev mode, all Chrome APIs are automatically stubbed with mock data.

## Installation

### Development (as Chrome Extension)

1. **Build the extension:**

   ```bash
   pnpm build
   ```

2. **Load in Chrome:**
   - Open `chrome://extensions`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked**
   - Select the `dist/` folder

3. **Open the Side Panel:**
   - Click the MissionPulse icon in the toolbar
   - The side panel opens with the mission feed

### Production Build

```bash
# Build with automatic version bump and ZIP
pnpm build:extension

# Or with a specific version
pnpm build:extension -- 1.0.0
```

This runs the full pipeline: clean, install, version bump, manifest verification, build, and ZIP creation. The output is `missionpulse-{version}.zip` in the project root.

## Tech Stack

| Layer           | Technology                                 | Version |
| --------------- | ------------------------------------------ | ------- |
| UI              | Svelte 5 (runes)                           | ^5.x    |
| Styling         | TailwindCSS 4 (CSS-first config)           | ^4.x    |
| State           | Svelte 5 runes ($state, $derived, $effect) | ^5.x    |
| Language        | TypeScript (strict)                        | ^5.x    |
| Build           | Vite + @crxjs/vite-plugin                  | ^6.x    |
| Testing         | Vitest + Playwright                        | latest  |
| Runtime         | Chrome Extension Manifest V3               | MV3     |
| Validation      | Zod                                        | ^3.23   |
| Icons           | Lucide Svelte                              | ^0.460  |
| Package Manager | pnpm                                       | ^10.x   |

## Architecture

MissionPulse follows **Functional Core & Imperative Shell** (FC&IS) architecture. The codebase is split into two strict layers with a unidirectional dependency rule.

```
src/lib/
├── core/                  # PURE FUNCTIONS — zero I/O, zero async, zero side effects
│   ├── backup/            # Backup shaping and validation
│   ├── connectors/        # Pure parsers + connector-side search context helpers
│   ├── errors/            # Result type and domain errors
│   ├── export/            # Export formatting
│   ├── metrics/           # Metrics types and pure calculations
│   ├── scoring/           # Relevance scoring, deduplication, notification filters
│   ├── seen/              # Seen-mission tracking logic
│   ├── tjm-history/       # Pure TJM history analysis
│   ├── types/             # Mission, profile, settings, TJM types
│   └── utils/             # Pure utility functions
│
└── shell/                 # I/O, async, side effects, orchestration
    ├── ai/                # Gemini Nano / Prompt API integration
    ├── connectors/        # Platform connectors using cookies/fetch
    ├── errors/            # Error handling and user-facing reporting
    ├── export/            # Browser download helpers
    ├── facades/           # Thin facades used by pages/state modules
    ├── messaging/         # Typed runtime bridge
    ├── metrics/           # Performance collection
    ├── notifications/     # Toasts + Chrome notifications
    ├── scan/              # Scan orchestration and parser health tracking
    ├── storage/           # IndexedDB, chrome.storage, caches, TJM history
    └── utils/             # Connection monitor, retry strategies, misc I/O helpers
```

**The fundamental rule:** Shell calls Core. Core NEVER calls Shell. Core doesn't know Shell exists.

This means every function in `core/` is:

- **Pure** — same input always produces the same output
- **Synchronous** — no `async/await`, no `Promise`
- **Side-effect free** — no `fetch`, no `indexedDB`, no `chrome.*`, no `Date.now()`
- **Fully testable without mocks** — just call with data, assert the result

Non-deterministic values (dates, IDs) are injected as parameters from the shell.

### Runtime Contexts

The current implementation runs across two main Chrome extension contexts:

```
┌─────────────┐     message     ┌──────────────────┐
│  Side Panel │ ──────────────→ │  Service Worker  │
│  (Svelte UI)│ ←────────────── │  (Orchestration) │
│  local UI   │    snapshots    │  scan, storage   │
└─────────────┘                  └──────────────────┘
```

- **Service Worker** — Background brain. Schedules scans via `chrome.alarms`, runs connector orchestration, persists scan/session state, and emits updates.
- **Side Panel** — The Svelte 5 UI. It owns local UI state and can read local persistence for bootstrapping, while runtime interactions still go through facades and typed bridge helpers.

### UI Component Architecture (Atomic Design)

```
src/ui/
├── atoms/          # Indivisible: Button, Badge, Icon, Chip, Skeleton, Toast
├── molecules/      # Composed: MissionCard, SearchInput, FilterBar, TJMGauge
├── organisms/      # Autonomous sections: MissionFeed, OnboardingWizard, ScanProgress
├── templates/      # Page layouts: FeedLayout, SettingsLayout
└── pages/          # Full pages: FeedPage, SettingsPage
```

| Level     | Accesses state?         | Calls services?   |
| --------- | ----------------------- | ----------------- |
| Atoms     | No                      | No                |
| Molecules | No (props only)         | No                |
| Organisms | Yes (via state modules) | Via state modules |
| Templates | No (layout only)        | No                |
| Pages     | Yes (creates stores)    | Yes (init)        |

### State Management

Shared state lives in `src/lib/state/` as Svelte 5 `.svelte.ts` modules using runes:

| Module       | File                         | Purpose                                      |
| ------------ | ---------------------------- | -------------------------------------------- |
| Feed         | `feed.svelte.ts`             | Mission feed state, search, filtering        |
| Onboarding   | `onboarding.svelte.ts`       | Configuration wizard state                   |
| Connection   | `connection.svelte.ts`       | Network status tracking                      |
| Toast        | `toast.svelte.ts`            | UI toast notifications                       |
| SettingsPage | `settings-page.svelte.ts`    | Settings page orchestration and side effects |

## Project Structure

```
pulse/
├── src/
│   ├── background/          # Service worker entry point
│   ├── sidepanel/           # Side panel entry, navigation shell, toast wiring
│   ├── lib/
│   │   ├── core/            # Pure business logic
│   │   ├── shell/           # I/O and orchestration
│   │   └── state/           # Svelte 5 state modules / page controllers
│   ├── ui/                  # Atomic design components + pages (Feed / TJM / Settings)
│   │   ├── atoms/
│   │   ├── molecules/
│   │   ├── organisms/
│   │   └── templates/
│   ├── dev/                 # Dev-only tools (tree-shaken in prod)
│   │   ├── mocks.ts         # Mock data
│   │   ├── chrome-stubs.ts  # Chrome API stubs
│   │   ├── DevPanel.svelte  # Ctrl+Shift+D dev panel
│   │   └── bridge-logger.ts # Message logging
│   ├── types/               # Global type declarations
│   ├── static/              # Static assets (icons)
│   └── manifest.json        # Chrome Extension manifest (MV3)
├── tests/
│   ├── unit/                # Vitest unit tests (core, state, UI)
│   ├── e2e/                 # Playwright end-to-end tests
│   ├── fixtures/            # Test data (HTML, missions)
│   └── health/              # Connector health checks against live platforms
├── scripts/
│   ├── build-extension.sh   # Production build pipeline
│   ├── verify-manifest.ts   # Manifest validation
│   └── bump-version.ts      # Version bumping
├── docs/                    # Documentation
├── AGENTS.md                # AI agent conventions and rules
├── vite.config.ts           # Vite + CRX build config
├── vitest.config.ts         # Test configuration
└── tsconfig.json            # TypeScript strict config
```

## Available Scripts

| Command                  | Description                          |
| ------------------------ | ------------------------------------ |
| `pnpm dev`               | Start dev server (stubs Chrome APIs) |
| `pnpm build`             | Build extension to `dist/`           |
| `pnpm build:extension`   | Full production build + ZIP          |
| `pnpm preview`           | Preview production build             |
| `pnpm test`              | Run unit tests once                  |
| `pnpm test:watch`        | Run unit tests in watch mode         |
| `pnpm test:coverage`     | Run unit tests with coverage report  |
| `pnpm test:e2e`          | Run Playwright E2E tests             |
| `pnpm lint`              | Lint with ESLint                     |
| `pnpm lint:fix`          | Auto-fix lint issues                 |
| `pnpm format`            | Format with Prettier                 |
| `pnpm format:check`      | Check formatting without writing     |
| `pnpm typecheck`         | TypeScript type checking             |
| `pnpm verify-manifest`   | Validate manifest.json               |
| `pnpm bump-version`      | Bump version (patch/minor/major)     |
| `pnpm health-check`      | Run connector health checks          |
| `pnpm health-check:json` | Health checks with JSON output       |

## Development

### Prerequisites

- **Node.js** >= 22
- **pnpm** >= 10 (`npm install -g pnpm`)
- **Chrome** >= 114 (for extension testing)

### Setup

```bash
# Clone the repository
git clone <repo-url> pulse
cd pulse

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Open `http://localhost:5173/src/sidepanel/index.html` — the UI works without Chrome, using mock data.

### Dev Panel

Press **Ctrl+Shift+D** (or **Cmd+Shift+D** on macOS) to open the development panel with:

- **Feed State** — Toggle between empty/loading/loaded/error states
- **Mock Missions** — Inject N mock missions instantly
- **Onboarding** — Toggle onboarding completion
- **Bridge Logs** — Real-time message traffic between contexts

All dev code in `src/dev/` is behind `import.meta.env.DEV` and tree-shaken from production builds.

### Connector Health Checks

Verify that all platform connectors can still scrape their targets:

```bash
pnpm health-check
```

This fetches live pages from each platform and validates that the HTML parsers still produce valid output. Screenshots are captured on failure for debugging.

## Testing

### Unit Tests (Vitest)

Unit tests cover the pure functional core — scoring, parsing, deduplication, and state logic. No mocks needed for core functions.

```bash
# Run all unit tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test:coverage
```

Test structure broadly mirrors the source:

```
tests/unit/
├── connectors/         # HTML parser tests (pure functions)
├── scoring/            # Relevance, dedup, notification filters
├── tjm-history/        # Pure TJM analysis
├── ui/                 # Component tests
└── machines/           # Legacy store / toast tests kept under historical naming
```

### End-to-End Tests (Playwright)

Full user journey tests covering critical flows:

```bash
pnpm test:e2e
```

Covers: onboarding flow, scan + feed display, offline mode, connector failure resilience, accessibility, navigation.

### Writing Tests

**Core tests** — Test pure functions with plain data. No mocks:

```typescript
import { scoreMission } from '$lib/core/scoring/relevance';
import type { Mission } from '$lib/core/types/mission';
import type { UserProfile } from '$lib/core/types/profile';

test('scores stack match highly', () => {
  const mission: Mission = { /* ... */ stack: ['React', 'TypeScript'] };
  const profile: UserProfile = { /* ... */ stack: ['React', 'TypeScript'] };
  expect(scoreMission(mission, profile)).toBeGreaterThan(70);
});
```

**Shell tests** — Mock `chrome.*` APIs as needed.

## Adding a New Connector

1. **Create the pure parser** in `src/lib/core/connectors/{platform}-parser.ts`
   - Export `parse{Platform}HTML(html: string, now: Date, idPrefix: string): Mission[]`
   - Pure function — inject `now` and `idPrefix`, no I/O

2. **Create the I/O connector** in `src/lib/shell/connectors/{platform}.connector.ts`
   - Implements `PlatformConnector` interface
   - Uses the pure parser + platform HTTP/session access from the shell layer

3. **Register** in `src/lib/shell/connectors/index.ts`

4. **Add host permissions** in `src/manifest.json`

5. **Write tests** in `tests/unit/connectors/{platform}.test.ts`
   - Test the parser with real HTML fixtures — no mocks needed
   - Add a health check in `tests/health/connectors/`

6. **Update the health-check runner/config** in `tests/health/` if needed

## Contributing

Contributions are welcome. Please follow these guidelines:

### Code Style

- **Svelte 5 runes only** — `$props()`, `$state`, `$derived`, `$effect`
- **Arrow functions** in TypeScript (align with existing file style if it uses `function` declarations)
- **No `any`** — use `unknown` + type guards
- **Design tokens** — use Tailwind theme variables, never hardcoded colors or sizes
- **Mobile first** — base styles target mobile, progressive enhancement via breakpoints

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(connector): add LeHibou platform scraper
fix(scoring): handle null TJM in relevance calculation
refactor(shell): extract retry logic into utility
test(scoring): add edge cases for deduplication
docs(readme): add connector development guide
chore(deps): update Svelte to 5.2
```

### Pull Requests

1. Create a feature branch: `feat/your-feature`
2. Write tests for new functionality
3. Ensure all tests pass: `pnpm test && pnpm typecheck && pnpm lint`
4. Open a PR against `main`

### Architecture Rules

- **Never import shell from core** — `core/` must remain pure
- **No I/O in core** — no `fetch`, `indexedDB`, `chrome.*`, `Date.now()`
- **No business logic in UI components** — delegate to `lib/core/` or state modules
- **No Svelte 4 syntax** — no `export let`, `$:`, `on:click`, `createEventDispatcher`
- **No `tailwind.config.js`** — TailwindCSS 4 uses CSS-first configuration in `src/ui/design-tokens.css`

## Documentation

Full documentation is available in the [`docs/`](./docs/) directory and in [`AGENTS.md`](./AGENTS.md) for detailed architecture conventions.

## License

MIT
