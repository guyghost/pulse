# Context: Nearby Metropolitan Area Matching

## Objective
Add a 'nearby' match level to the location scoring system so that cities within the same metropolitan area (e.g., Nanterre → Paris, Villeurbanne → Lyon) score 70% instead of 0%.

## Constraints
- Platform: Web (Chrome Extension)
- Pure Core functions only (no I/O, no async)
- Top 5 metros: Paris, Lyon, Marseille, Bordeaux, Toulouse
- Paris scope: petite couronne (92, 93, 94) — NOT grande couronne (77, 78, 91, 95)

## Technical Decisions
| Decision | Justification | Agent |
|----------|---------------|-------|
| New 'nearby' type at 70% | Between synonym (80%) and partial (60%) — metro proximity is valuable but less certain | @orchestrator |
| Petite couronne only for Paris | User choice — closer suburbs are more relevant | @orchestrator |
| Top 5 metros | Covers main French freelance markets | @orchestrator |

## Artifacts Produced
| File | Agent | Status |
|------|-------|--------|
| `src/lib/core/scoring/location-matching.ts` | @codegen | ✅ Modified |
| `src/lib/core/scoring/relevance.ts` | @codegen | ✅ Modified |

## Inter-Agent Notes
<!-- Format: [@source → @destination] Message -->
