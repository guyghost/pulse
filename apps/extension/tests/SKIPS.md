# Taxonomie des tests skippés

Chaque skip du repo doit être catégorisé ici. Deux catégories légitimes, une interdite.

| Catégorie                 | Mécanisme                                     | Signification                                                                                                                                                                 |
| ------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Env-conditionnel**      | `describe.skipIf(!hasPinnedX())`              | Le test tourne dès que l'outil épinglé est présent (CI release, machine de packaging). Skip visible mais actif là où ça compte.                                               |
| **Sentinelle permanente** | `describe.skip` + titre `[release-blocker:…]` | Tripwire intentionnel : le test throw **par design** tant que le blocker nommé n'est pas résolu. Il documente un risque de livraison, il ne teste pas encore de comportement. |
| ~~Skip sans raison~~      | —                                             | Interdit. Toute nouvelle entrée `skip`/`skipIf` doit être référencée dans ce fichier.                                                                                         |

## Inventaire (audit du 2026-09-02 — 51 tests skippés, 6 fichiers vitest + 1 fichier Playwright)

### Env-conditionnels

| Fichier                                              | Condition                                                                                                           | Réactivation                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `tests/unit/mv3/chromium-process.test.ts`            | `hasPinnedChromium()` — binaire Playwright Chromium `chromium-1228` présent (`/home/runner/.cache/ms-playwright/…`) | Disponible sur les runners CI release Linux ; pour du local : installer le binaire à ce chemin. |
| `tests/unit/scripts/canonical-artifact.test.ts`      | `hasPinnedPython()` — Python `3.14.5` (scanner épinglé, cf. `RELEASE_DESCRIPTOR_SCANNER`)                           | `PULSE_RELEASE_PYTHON=<chemin python 3.14.5>` ou `python3` en 3.14.5.                           |
| `tests/unit/scripts/mv3-artifact.test.ts`            | idem `hasPinnedPython()`                                                                                            | idem                                                                                            |
| `tests/unit/scripts/verify-release-artifact.test.ts` | idem `hasPinnedPython()`                                                                                            | idem                                                                                            |
| `tests/unit/scripts/package-sealed-dist.test.ts`     | idem `hasPinnedPython()`                                                                                            | idem                                                                                            |
| `tests/e2e/copilot-premium.test.ts` (Playwright)     | `VITE_COPILOT_ROLLOUT_ENABLED !== 'true'` — feature-flag copilot désactivé                                          | Build dev avec `VITE_COPILOT_ROLLOUT_ENABLED=true`, puis `pnpm test:e2e`.                       |

### Sentinelle permanente

| Fichier                                                              | Blocker                                                                                                                                                                                                            | Runbook                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `tests/unit/scripts/release-runtime-oci-host-adapter-docker.test.ts` | `release-runtime.transport-consumer-capability-issuer-missing` — aucun consommateur de transport en production ne détient le chemin d'enregistrement private verified-payload ; l'exécution raw DTO est interdite. | Voir runbook ci-dessous. |

## Runbook — sentinelle `[release-blocker:release-runtime.transport-consumer-capability-issuer-missing]`

**Quand la prendre au sérieux ?** Avant toute release qui branche le runtime
release sur un host adapter Docker OCI (scripts `release:seal-candidate`,
`package:sealed`, `verify:release-artifact`).

**Étapes de résolution :**

1. Identifier le consommateur de transport authentifié qui émettra le
   one-shot capability (opaque) requis pour l'enregistrement
   verified-payload privé.
2. Implémenter l'émission de capability dans ce consommateur (jamais de
   contournement raw-DTO).
3. Supprimer le `describe.skip` du test sentinelle — il doit alors **passer**
   en prouvant que la capability est exigée avant exécution.
4. Mettre à jour ce fichier (la sentinelle quitte l'inventaire).

**Interdits :** dé-skipping sans implémenter l'issuer ; remplacer le `throw`
par un assert faible ; renommer le blocker sans reférencer le ticket de suivi.

## Comptage

Le reporter Vitest affiche à chaque run :

```
⏭️  Skips — taxonomie (cf. tests/SKIPS.md) : N au total
   • env-conditionnels : X
   • permanents ([release-blocker:…]) : Y
```

Recomptage manuel : `pnpm --filter @pulse/extension test 2>&1 | grep -A3 "Skips — taxonomie"`.

**Règle de maintenance :** si `Y` (permanents) augmente sans entrée dans ce
fichier, le skip est refusé en review. La catégorie env-conditionnelle doit
rester > 0 seulement via `skipIf` — jamais via `skip` nu.
