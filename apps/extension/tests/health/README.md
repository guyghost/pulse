# Health checks connecteurs

Checks fixture-based exécutés en local et en CI cron. Aucun appel réseau vers les plateformes.

## Commandes

```bash
pnpm health-check
pnpm health-check:json
```

## Ce qui est vérifié

Pour chaque connecteur du registre (`connector-registry.ts`) :

1. Fichier de tests unitaires parsers présent
2. Tests unitaires verts (`vitest run`)
3. Fixtures de régression présentes (si enregistré)

En plus :

- Suite `parser-regression` (golden files LeHibou)

## Ajouter un connecteur

1. Ajouter l'entrée dans `connector-registry.ts`
2. Créer `tests/unit/connectors/{platform}.test.ts`
3. (Optionnel) Ajouter fixtures dans `tests/fixtures/regression/{platform}/`
