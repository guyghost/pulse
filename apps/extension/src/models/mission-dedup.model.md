# Mission Deduplication Model

## Scope

This model is the source of truth for mission identity resolution after connector parsing.
It covers duplicate detection and canonical mission selection for reposted missions, including
platform proxy cases such as a Cherry Pick mission republished on Free-Work.

## Inputs

- `Mission[]`: parsed missions from Core connector parsers.
- `threshold`: minimum confidence required to mark a duplicate, default `0.8`.
- `source`: trusted platform identity from the connector, not from free text.

No LLM output may decide mission identity, duplicate status, or canonical selection.
Semantic scoring may add review signals only after the mission identity is resolved.

## States

| State                | Meaning                                                                               | Terminal |
| -------------------- | ------------------------------------------------------------------------------------- | -------- |
| `candidate`          | A parsed mission is ready to compare against retained missions.                       | No       |
| `unique`             | No compatible retained mission reached the duplicate threshold.                       | Yes      |
| `duplicate`          | A compatible retained mission reached the duplicate threshold.                        | Yes      |
| `canonical_replaced` | The new duplicate has higher canonical priority or quality than the retained mission. | Yes      |
| `rejected_candidate` | A retained mission was considered but failed compatibility or confidence checks.      | Yes      |

## Events And Transitions

| Event                       | From        | Guard                                                                                                                | To                   | Effect                                                       |
| --------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------ |
| `same_url`                  | `candidate` | normalized URLs match and both have specific paths                                                                   | `duplicate`          | record relation with confidence `1`                          |
| `same_structured_signature` | `candidate` | normalized title, client, and stack signature match                                                                  | `duplicate`          | record relation with confidence `1`                          |
| `proxy_repost_match`        | `candidate` | one client is a known platform proxy, locations are compatible, title overlap is strong, stack overlap is sufficient | `duplicate`          | record relation with reason `same_title_stack_proxy_client`  |
| `direct_source_preferred`   | `duplicate` | duplicate source priority or quality is higher than retained mission                                                 | `canonical_replaced` | retained mission is replaced by the better canonical mission |
| `client_conflict`           | `candidate` | real client names disagree and neither is a platform proxy                                                           | `rejected_candidate` | no relation is recorded                                      |
| `location_conflict`         | `candidate` | specific locations disagree without remote-compatible context                                                        | `rejected_candidate` | no relation is recorded                                      |
| `below_threshold`           | `candidate` | computed confidence is below threshold                                                                               | `rejected_candidate` | no relation is recorded                                      |
| `no_candidate`              | `candidate` | no retained mission shares indexed tokens                                                                            | `unique`             | append mission to retained set                               |

## Cherry Pick Parsing Invariants

- Cherry Pick `skills` become `Mission.stack` only when each item is a concise skill label.
- Description paragraphs, semantic explanations, or sentence-like text found in `skills` are discarded.
- Parser output stays pure: no I/O, no clock access, and no LLM calls.
- `description` remains the only field for long mission prose after metadata cleanup.

## Deduplication Invariants

- Core deduplication is deterministic and pure.
- A known platform name in `client` means proxy source, not real end client.
- Free-Work reposts with client `Cherry Pick` must resolve to the Cherry Pick mission when title and stack signals match.
- Direct/native sources outrank broad aggregators when duplicate confidence is high enough.
- Incompatible real clients or incompatible specific locations prevent merging.
- Duplicate relations always point from retained canonical mission to duplicate mission.

## Review Checklist

- Nominal: exact URLs, exact structured signatures, and proxy reposts merge.
- Errors: malformed optional fields are tolerated by parser normalization and do not throw.
- Cancellations/retries: not applicable in Core; Shell scan retry/cancel behavior must not change dedup decisions.
- Permissions: not applicable in Core; connector permissions only affect whether missions are available as inputs.
- Terminal states: every candidate ends as `unique`, `duplicate`, `canonical_replaced`, or `rejected_candidate`.
- Forbidden: state transitions based on LLM text, semantic reason, or free-form prompt output.
