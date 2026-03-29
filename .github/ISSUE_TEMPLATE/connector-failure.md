---
title: '🔴 Connector Failure: ${{ env.FAILED_CONNECTORS }}'
labels: ['connector-failure', 'automated', 'bug']
assignees: []
---

## Connector Health Check Failed

**Date:** ${{ env.DATE }}
**Run:** [View Workflow Run](${{ env.RUN_URL }})

### Failed Connectors

The following connector(s) failed their health check:

```
${{ env.FAILED_CONNECTORS }}
```

### Impact

- Users may not be able to fetch missions from the affected platform(s)
- Scoring may be incomplete for missions from these sources
- Notifications for new missions may be delayed or missing

### Next Steps

1. **Investigate:** Check the workflow logs for error details
2. **Identify:** Determine if the DOM structure changed, API was modified, or site is down
3. **Fix:** Update the connector parser or implementation
4. **Test:** Run local tests with `pnpm vitest run tests/health/connectors`
5. **Deploy:** Create a PR with the fix

### Related Files

- `src/lib/core/connectors/*.ts` - Parser implementations
- `src/lib/shell/connectors/*.connector.ts` - Connector implementations
- `tests/health/connectors/*.test.ts` - Health check tests

---

_This issue was automatically created by the connector health check workflow._
