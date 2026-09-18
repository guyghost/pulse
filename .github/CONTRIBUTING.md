# Contribuer à MissionPulse

Merci d'aider à améliorer MissionPulse. Ce projet est local-first et sensible à la vie privée : les contributions doivent préserver la frontière functional core / imperative shell et éviter toute collecte d'identifiants.

## Installation

```bash
pnpm install
pnpm dev
pnpm ci:check
```

Utilisez `pnpm dev:local` quand vous avez besoin de la stack Supabase locale pour les flux landing/dashboard.

## Règles de développement

- Utiliser uniquement les runes Svelte 5 : `$props`, `$state`, `$derived`, `$effect`.
- Garder `apps/extension/src/lib/core/` pur : pas d'I/O, pas d'async, pas de `chrome.*`, pas de `Date.now()`.
- Garder les effets de bord dans `apps/extension/src/lib/shell/`.
- Ne pas committer de secrets, fichiers `.env` locaux, cookies, tokens de session ou ZIP de release générés.
- Ajouter ou mettre à jour les tests pour les changements de parser, scoring, storage et messaging.
- Utiliser Conventional Commits : `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.

## Avant d'ouvrir une pull request

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Pour les changements d'UI de l'extension, lancer les tests Playwright pertinents depuis `apps/extension`.

## Documentation utile

- [README du projet](../README.md)
- [Index de la documentation](../docs/README.md)
- [Décisions d'architecture](../docs/adr/README.md)
- [CI/CD](../docs/CI-CD.md)
- [Préparation open source](../docs/open-source-readiness.md)
