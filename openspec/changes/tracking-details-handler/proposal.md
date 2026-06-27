# Proposal: Wire UPDATE_TRACKING_DETAILS production handler

## Why — Bug produit

`UPDATE_TRACKING_DETAILS` est envoyé par l'UI mais n'a **aucun handler dans le service worker de production**. Conséquence : en production, planifier/effacer la "prochaine action" d'une mission suivie est un **no-op silencieux** — le message est validé par le bridge puis tombe dans le vide du listener, la promesse `sendMessage` rejette ("message port closed"), et la date n'est jamais persistée.

Le bug est **invisible en dev** car `chrome-stubs.ts:465` gère le message (avec un objet synthétique non persisté). Il n'apparaît qu'en production.

Découvert lors du Workstream B (code-quality-cleanup) en supprimant l'import mort `setTrackingNextActionAt` de `background/index.ts` — l'import était mort précisément parce que le handler n'existait pas.

## Preuve du bug

| Couche                                                                                                             | État                                  |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **Émetteur UI** `src/lib/state/tracking.svelte.ts:77` `updateNextActionAt()` → envoie `UPDATE_TRACKING_DETAILS`    | ✅ existe                             |
| **Call sites** `ApplicationsPage.svelte:367` (set date), `:377` (clear date)                                       | ✅ câblés                             |
| **Type message** `bridge.ts:156` + **schema** `schemas.ts:729` (`{ missionId, nextActionAt?: IsoDateTimeOrNull }`) | ✅ définis                            |
| **Dev handler** `src/dev/chrome-stubs.ts:465` retourne `TRACKING_UPDATED` avec `nextActionAt`                      | ✅ existe (synthétique, non persisté) |
| **Handler production** `src/background/index.ts`                                                                   | ❌ **MANQUANT**                       |

Le listener de `background/index.ts` gère `UPDATE_TRACKING` (L940), `RESTORE_TRACKING` (L981), `GET_TRACKINGS` (L1003), `GENERATE_ASSET` (L1020 stub), `GET_GENERATED_ASSETS` (L1028) — mais **pas** `UPDATE_TRACKING_DETAILS`.

## What Changes

Ajouter un handler `UPDATE_TRACKING_DETAILS` dans `src/background/index.ts`, entre les handlers `UPDATE_TRACKING` et `RESTORE_TRACKING` (section "Tracking handlers"), suivant exactement le même pattern que `UPDATE_TRACKING` :

1. Extraire `{ missionId, nextActionAt }` du payload validé
2. `getTracking(missionId)` — si rien n'existe, `createTracking(missionId, now)` (cohérent avec `UPDATE_TRACKING` et avec le dev stub qui retourne un statut `'detected'`)
3. Produire un nouvel objet tracking avec `nextActionAt` mis à jour (immuable : `{ ...tracking, nextActionAt: nextActionAt ?? null }`)
4. `saveTracking(updated)` puis `sendResponse({ type: 'TRACKING_UPDATED', payload: updated })`
5. `try/catch` : en cas d'erreur, logger + répondre avec le tracking courant (même stratégie de résilience que `UPDATE_TRACKING`)
6. Retourner `true` (réponse async)

### Note FC&IS

La mutation de l'objet tracking (`{ ...tracking, nextActionAt }`) est une transformation de données simple. **Pas besoin d'extraire une fonction Core dédiée** — c'est un simple spread, identique en complexité à ce que ferait une fonction `withNextActionAt(tracking, value)` qui n'apporterait aucune valeur testable isolément. Si tu préfères la pureté maximale, une fonction `setNextActionOnTracking(tracking, nextActionAt)` dans `core/tracking/` est acceptable mais optionnelle. Décision laissée à l'implémenteur.

### Pas de fonction storage dédiée

Il n'existe pas de `setTrackingNextActionAt` dans `src/lib/shell/storage/tracking.ts` (uniquement `saveTracking`, `getTracking`, etc.). Le handler utilise donc `getTracking` + `saveTracking`, comme `UPDATE_TRACKING`. Ne pas créer de fonction storage redondante.

## Constraints

- FC&IS : Shell only (handler = I/O + délégation). Pas de Core→Shell.
- TS strict, pas de `any`. Le payload est déjà validé par le schema Zod du bridge.
- `now` injecté via `Date.now()` côté Shell (le handler est dans le Shell, c'est autorisé).
- Ne pas casser le dev stub (il reste la référence dev).
- Conventional commit : `fix(tracking): wire UPDATE_TRACKING_DETAILS production handler`

## Tests

1. **Unit test** `tests/unit/background/index.test.ts` (ou un nouveau `tests/unit/background/tracking-handler.test.ts`) : mocker `getTracking`/`saveTracking`/`createTracking` et vérifier :
   - tracking existant → `nextActionAt` mis à jour + `saveTracking` appelé + réponse `TRACKING_UPDATED`
   - tracking inexistant → `createTracking` appelé, puis nextActionAt appliqué
   - `nextActionAt: null` (clear) → champ remis à null
   - `nextActionAt: undefined` (non fourni) → comportement : traiter comme null (le schema le marque `.optional()`)
   - erreur storage → réponse de résilience (tracking courant), pas de throw
2. **E2E** (optionnel, après suite verte) : sur ApplicationsPage, planifier une next-action, recharger, vérifier la persistance. Le dev stub rend ce test vert en dev ; pour couvrir le path production il faudrait un context d'extension réel (hors scope E2E dev-mode).

## Out of Scope

- `GENERATE_ASSET` (intentionnellement un stub `GENERATION_UNAVAILABLE` — feature AI désactivée par design, pas un bug)
- Refactor de la section tracking handlers
- Migration vers un pattern handler-table (discussion séparée si le listener grossit)

## Verification

```bash
pnpm --filter @pulse/extension typecheck
pnpm --filter @pulse/extension lint
pnpm --filter @pulse/extension test       # incluant le nouveau test handler
pnpm --filter @pulse/extension test:e2e   # suite reste verte (117/117)
```

Manual (dev mode via stub, confirme le contrat UI) : ouvrir ApplicationsPage, planifier une next-action → la UI réagit. Le vrai test production nécessite un build d'extension chargé.

## Severity

**Major** — feature cassée en production (silencieusement). Aucun crash, aucune perte de données, mais la fonctionnalité "rappel de prochaine action" ne fonctionne pas hors dev. Faible risque de régression (handler isolé, pattern éprouvé).
