# Context: Unify Scan Architecture

## Objective

Fusionner les deux moteurs de scan parallèles en un seul moteur canonique. Le Service Worker (`scanner.ts`) devient l'unique moteur de scan. Le Side Panel envoie `SCAN_START` via le bridge et consomme `SCAN_PROGRESS`/`SCAN_COMPLETE`.

## Constraints

- Platform: Chrome Extension Manifest V3
- Offline first: no
- Design system: Svelte 5 + TailwindCSS 4
- Architecture: FC&IS

## Problème identifié

Deux moteurs de scan coexistent avec des pipelines différents :

| Aspect        | Service Worker (Path A)                   | Side Panel (Path B)                                      |
| ------------- | ----------------------------------------- | -------------------------------------------------------- |
| Entry         | `chrome.alarms` → `scanner.ts::runScan()` | Button/shortcut → `ScanOrchestrator` → `ConnectorRunner` |
| Dedup         | ✅                                        | ✅                                                       |
| Scoring       | ✅                                        | ✅                                                       |
| Semantic      | ✅ (Gemini Nano)                          | ❌                                                       |
| Purge         | ✅ (90 days)                              | ❌                                                       |
| Metrics       | ✅                                        | ❌                                                       |
| Parser Health | ✅                                        | ❌                                                       |
| Notifications | ✅                                        | ❌                                                       |
| Progress UI   | ❌ (no DOM)                               | ✅ (real-time states)                                    |

## Decision: Service Worker as canonical engine

- Pipeline complet
- Single source of truth
- Panel becomes pure consumer via bridge

## Technical Decisions

| Decision                                          | Justification                                                   | Agent         |
| ------------------------------------------------- | --------------------------------------------------------------- | ------------- |
| SW as canonical engine                            | Pipeline complet, déjà gère auto-scan                           | @orchestrator |
| Add SCAN_START/SCAN_PROGRESS/SCAN_CANCEL messages | Panel needs to request scans + receive progress                 | @orchestrator |
| Delete ScanOrchestrator + ConnectorRunner         | Redondants avec scanner.ts, cause de la dual architecture       | @orchestrator |
| Progress callback enrichi dans scanner.ts         | UI needs per-connector state (detecting/fetching/retrying/done) | @orchestrator |

## Artifacts Produced

| File                                        | Agent    | Status |
| ------------------------------------------- | -------- | ------ |
| `src/lib/shell/messaging/bridge.ts`         | @codegen | TODO   |
| `src/lib/shell/scan/scanner.ts`             | @codegen | TODO   |
| `src/background/index.ts`                   | @codegen | TODO   |
| `src/ui/pages/FeedPage.svelte`              | @codegen | TODO   |
| `src/lib/state/scan-orchestrator.svelte.ts` | @codegen | DELETE |
| `src/lib/state/connector-runner.svelte.ts`  | @codegen | DELETE |

## Inter-Agent Notes

<!-- Format: [@source → @destination] Message -->
