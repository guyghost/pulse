# Health checks connecteurs

Cette surface fixture-only couvre exactement les six connecteurs du catalogue complet, y compris
Malt, indépendamment de `connectors.config.json`. Elle n'effectue aucun appel réseau vers une
plateforme, n'utilise aucune session navigateur, aucun cookie, aucun profil Chrome et aucun secret
de production.

## Commandes locales

```bash
pnpm health-check
pnpm health-check:json
```

Chaque entrée exige un test unitaire régulier, un répertoire régulier de fixtures non vide et un
golden pour chaque fixture. Le registre rejette les symlinks, types spéciaux, doublons, ordre, nom,
ID, chemin ou catalogue qui dérivent. La suite globale `parser-regression` fait partie du rapport.

## Frontière locale

Ces commandes restent un outil local de régression sur fixtures. Aucun workflow planifié ne les
exécute et aucun acteur ne crée d'issue GitHub automatiquement. Leur rapport ne quitte pas la
machine sauf partage manuel explicite par un développeur.

## Ajouter un connecteur

1. Ajouter le connecteur au catalogue complet et au registre de santé trié.
2. Créer `tests/unit/connectors/{platform}.test.ts`.
3. Ajouter au moins une fixture `.html` ou `.json` sous
   `tests/fixtures/regression/{platform}/` et son golden correspondant.
