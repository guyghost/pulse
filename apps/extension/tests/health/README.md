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

## Autorité du workflow

Permissions exactes :

- `health-capture`: `contents: read` ;
- `issue-writer`: `actions: read`, `contents: read`, `issues: write` ;
- `conclusion`: `contents: read`.

Le niveau global est `{}`. Le vérificateur de source n'a ni token ni autorité d'administration. Seul
l'acteur `issue-writer` admis reçoit `GITHUB_TOKEN`; `conclusion` conserve `contents: read` uniquement
pour son checkout exact et ne reçoit aucun token dans son environnement. L'artifact courant
`connector-health-report` contient seulement `connector-health-evidence.v1.json`, sans overwrite,
avec rétention de 14 jours.

Chaque job fixe Node `22.23.1`, pnpm `10.32.1`, admet le checkout exact avant toute installation,
vérifie ensuite le `packageManager` avec intégrité et lance `pnpm install --frozen-lockfile`.
Entrées principales :

```text
pnpm --filter @pulse/extension exec tsx scripts/connector-health/capture.ts
pnpm --filter @pulse/extension exec tsx scripts/connector-health/issue-writer.ts
pnpm --filter @pulse/extension exec tsx scripts/connector-health/conclusion-cli.ts
```

Actions immuables :

- `actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd` ;
- `pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093` ;
- `actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` ;
- `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` ;
- `actions/download-artifact@70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3`.

Le trigger planifié ou manuel doit correspondre au dépôt, à la branche par défaut, à sa ref, au SHA,
au workflow et au checkout propre exacts. `contents: read` ne prouve pas la protection de branche :
c'est un contrôle administrateur hors bande.

Le périmètre exécutable fait confiance au checkout, aux scripts/tests committés et au graphe de
dépendances gelé. Les fixtures seules sont des données hostiles non exécutables. La preuve PGID
porte uniquement sur le groupe contrôlé ; elle ne garantit pas le confinement de code committé
malveillant qui changerait volontairement de session ou se daemoniserait.

Les terminaux enfants sont `capture_passed`, `capture_failed`,
`capture_infrastructure_failed`, `issue_settled` et `issue_failed`. Une fois
`CONCLUSION_ACTOR_STARTED` émis, les seuls terminaux workflow sont `passed`, `failed_recorded` et
`failed_unreported`; les échecs enregistrés ou non restent rouges. Une interruption avant le
marqueur est `pre_actor_bootstrap_interrupted` : run rouge, aucun terminal XState et aucune
revendication de santé.

## Ajouter un connecteur

1. Ajouter le connecteur au catalogue complet et au registre de santé trié.
2. Créer `tests/unit/connectors/{platform}.test.ts`.
3. Ajouter au moins une fixture `.html` ou `.json` sous
   `tests/fixtures/regression/{platform}/` et son golden correspondant.
