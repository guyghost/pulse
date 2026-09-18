# Instructions Copilot — MissionPulse

MissionPulse est une extension Chrome (Manifest V3) dans un monorepo pnpm + Turborepo. Elle scrappe les plateformes de missions freelance via les sessions navigateur existantes de l'utilisateur et les présente dans un feed unique avec scoring. 100 % local-first : pas de backend, pas de télémétrie, pas d'identifiants stockés.

`AGENTS.md`, `README.md` et `.github/CONTRIBUTING.md` sont les sources de vérité longues. Ce fichier capture les règles spécifiques au projet qu'un agent a le plus de chances de se tromper.

## Layout du monorepo

- `apps/extension/` — extension Chrome (Svelte 5 + Vite + MV3). Tous les chemins ci-dessous sont relatifs à ce dossier.
- `apps/landing/` — site marketing statique (missionpulse.app).
- `packages/design/`, `packages/domain/`, `packages/ui/`, `packages/tsconfig/` — partagés.

Lancer les commandes depuis la racine du dépôt sauf mention contraire. La plupart des tâches ciblent l'extension : `pnpm --filter @pulse/extension <script>`.

## Commandes

```bash
pnpm dev:local        # Supabase local + .env.local + dev servers (API Chrome stubées avec des mocks)
pnpm dev              # dev servers uniquement
pnpm ci:check         # format:check && lint && typecheck && test && build  (aussi la gate pre-push)
pnpm improvement:loop # format, lint, typecheck, tests, régression parser, health checks connecteurs

# Ciblé extension
pnpm --filter @pulse/extension typecheck
pnpm --filter @pulse/extension lint
pnpm --filter @pulse/extension test
pnpm --filter @pulse/extension test:watch
pnpm --filter @pulse/extension test:coverage          # gate 70 % sur src/lib/core/**
pnpm --filter @pulse/extension test:regression        # régression parser golden
UPDATE_GOLDENS=1 pnpm --filter @pulse/extension test:regression   # régénérer les goldens
pnpm --filter @pulse/extension health-check           # sur fixtures, sans appel plateforme réel
pnpm --filter @pulse/extension health-check:json
pnpm --filter @pulse/extension test:e2e               # Playwright (build @pulse/ui d'abord)
```

Lancer **un seul** test unitaire :

```bash
pnpm --filter @pulse/extension exec vitest run tests/unit/scoring/relevance.test.ts
# ou par pattern de nom :
pnpm --filter @pulse/extension exec vitest run -t "deduplicates by URL"
```

Dev Panel : `Ctrl+Shift+D` dans le side panel bascule l'injection de mocks, les changements d'état et les logs bridge.

Le dev server de l'extension tourne sur **http://localhost:5176** (voir `apps/extension/vite.config.ts`) ; en dev les API Chrome sont stubées avec des mocks, l'UI du side panel est donc entièrement pilotable dans un onglet navigateur normal. Utiliser le serveur MCP Playwright (`.mcp.json`) pour la vérification visuelle des changements UI — lancer `pnpm dev` d'abord, puis naviguer vers l'URL du side panel.

## Architecture — Functional Core / Imperative Shell (strict)

`apps/extension/src/lib/core/` est **pur** : pas de `fetch`, pas d'`indexedDB`, pas de `chrome.*`, pas d'`async/await`, pas de `Date.now()`, pas de `Math.random()`, pas de `console`. Tout ce qui est non déterministe (heure courante, IDs générés) est passé en paramètre depuis le shell.

`apps/extension/src/lib/shell/` possède toutes les I/O, l'async, les retries et l'orchestration, et délègue les calculs au core.

- **Le Shell peut importer le core. Le core ne doit JAMAIS importer le shell.** Traiter un fichier `core/` important depuis `shell/` comme une erreur de build.
- Les connecteurs injectent `new Date()` et les préfixes d'ID dans les parsers purs de `core/connectors/`.
- `vitest.config.ts` applique une gate de couverture 70/70/60/70 sur `src/lib/core/**` — garder la nouvelle logique pure là pour qu'elle soit couverte par des tests unitaires sans mocks.

## Règle de workflow : Model → Review → Implement → Verify

Tout changement de workflow, de fonctionnalité métier ou de décision d'état doit passer par cette boucle. **Ne jamais passer directement du prompt au code.**

1. **Model** — Définir explicitement états, événements, transitions, effets de bord et invariants. Les modèles faisant foi vivent dans `apps/extension/src/models/*.model.md` et les changements proposés dans `openspec/changes/`. Utiliser XState pour les workflows importants. Si le comportement ne peut pas être modélisé, il n'est pas prêt à être implémenté.
2. **Review** — Confirmer que le modèle couvre les chemins nominaux, erreurs, annulations, retries, permissions et états terminaux. Interdire les transitions implicites ou pilotées par texte libre.
3. **Implement** — L'UI, le messaging et l'orchestration consomment le modèle. Les LLM vivent uniquement dans des workers IA dédiés (ex. `lib/shell/ai/`) ; ils peuvent proposer/extraire/classer/enrichir du contenu mais **ne décident jamais une transition d'état**.
4. **Verify** — Tester les transitions autorisées et interdites et les invariants du modèle ; confirmer qu'aucune logique métier n'a fuité hors du modèle.

Forme courte : **le LLM produit des signaux ; le modèle décide.**

## Conventions Svelte 5 & styling

- Runes Svelte 5 uniquement. Utiliser `$props()`, `$state`, `$derived`, `$effect`.
- Interdit : `export let`, déclarations réactives `$:`, stores `writable`/`readable`/`derived`, `on:click`/`on:input`, `createEventDispatcher`, `$$props`/`$$restProps`. Utiliser les attributs d'événements natifs (`onclick`) et les callback props.
- L'état UI partagé vit dans `src/lib/state/*.svelte.ts` sous forme de factory functions ou de classes utilisant les runes.
- TailwindCSS 4, CSS-first. Les design tokens vivent dans `packages/design/` et sont exposés via `apps/extension/src/ui/design-tokens.css`. **Ne pas ajouter de `tailwind.config.js`/`.ts`** ni de config Tailwind JS/TS.
- Atomic Design dans `src/ui/` : atoms → molecules → organisms → templates → pages. Atoms/molecules reçoivent les données via props uniquement ; organisms et pages peuvent toucher les modules d'état.

## Connecteurs & messaging

- Une plateforme = un **parser pur** dans `core/connectors/{platform}-parser.ts` (`parse{Platform}HTML(html, now, idPrefix)`) + un **connecteur I/O** dans `shell/connectors/{platform}.connector.ts`. Enregistrer les nouveaux connecteurs dans `shell/connectors/index.ts`, ajouter les `host_permissions` dans `src/manifest.json`, et ajouter un test de parser sans mocks dans `tests/unit/connectors/`.
- Quand le DOM d'une plateforme change, le connecteur throw une `ConnectorError` typée ; le runner le marque `error`, notifie l'utilisateur, et les autres connecteurs continuent. Ne pas avaler les erreurs de connecteur.
- Le side panel n'appelle jamais IndexedDB, `chrome.cookies` ni les autres API `chrome.*` directement. Tout traverse les contextes via `src/lib/shell/messaging/bridge.ts` avec des messages typés.

## Hygiène des commits

- Conventional Commits avec scope par domaine : `feat(connector): …`, `fix(tjm): …`, `refactor(scoring): …`.
- Pas de `any` (TypeScript strict). Pas d'identifiants stockés, cookies, tokens de session ni ZIP de release générés dans les commits.
- `pre-push` exécute `ci:check`. Le rendre vert en local avant de pousser.

## Langues

- Code et commentaires en anglais ; documentation `.md` en français ; copy UI en français. Voir `AGENTS.md`.
