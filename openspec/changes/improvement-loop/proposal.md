# Proposal: Boucle d'amélioration extension

## Why

MissionPulse dispose d'une CI solide et d'outils runtime (circuit breaker, parser-health, error-analytics), mais la boucle n'est pas formalisée ni entièrement connectée :

- health checks cron planifiés mais absents du repo
- error-analytics non exportable par l'utilisateur
- régression golden limitée à LeHibou
- pas de commande unique pour l'itération locale

## What Changes

1. **Documentation** : `docs/improvement-loop.md` — cycle Observer → Apprendre
2. **Script local** : `pnpm improvement:loop` — gate unifiée
3. **Health checks** : `tests/health/run-health-checks.ts` + workflow cron
4. **Export diagnostic** : Settings → JSON local (erreurs + santé connecteurs)
5. **OpenSpec** : ce proposal comme tracker de l'itération

## Out of Scope (itérations suivantes)

- Health checks live contre les plateformes réelles (sessions requises)
- Extension régression golden aux 4 autres connecteurs
- Dashboard métriques production

## Verification

```bash
pnpm improvement:loop
pnpm --filter @pulse/extension test
pnpm --filter @pulse/extension typecheck
```

## Results

Implémenté le 2026-06-30 :

| Livrable                                 | Statut                     |
| ---------------------------------------- | -------------------------- |
| `docs/improvement-loop.md`               | ✅                         |
| `pnpm improvement:loop`                  | ✅                         |
| `tests/health/run-health-checks.ts`      | ✅ 5 connecteurs           |
| `.github/workflows/connector-health.yml` | ✅ cron quotidien          |
| Export diagnostic Settings               | ✅ `GET_DIAGNOSTIC_EXPORT` |

Prochaines itérations : ~~golden regression pour free-work, hiway, collective, cherry-pick~~ ✅ (7 fixtures, 5 connecteurs).
