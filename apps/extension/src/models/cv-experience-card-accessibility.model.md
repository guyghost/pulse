# CV experience card accessibility model

Status: **MODEL REVISION 5 — pending independent review; implementation forbidden until approval**.

Pending behavior SHA-256: `976efad5aaef51859ec7795d4c291eb461c05edf90eaf086b034ab2d2fa659a1`.

The normalized behavior hash is SHA-256 of the complete raw UTF-8/LF bytes of
this file after replacing only the value between backticks on the
`Pending behavior SHA-256` line with the literal
`__PENDING_BEHAVIOR_SHA256__`. No other normalization is permitted.

Revision 5 closes the revision-4 final review. It gives stale callback
settlements an explicit non-UI transition, consumes accepted settlement records
idempotently, makes current-role end-date validation focusable, and expands RED
coverage for hostile payload/callback boundaries. It preserves every other
revision-4 closure and the exact packaged A3 contract.

## Objective and boundary

`ExperienceCard.svelte` exposes one stable, keyboard-operable accessibility
contract for one persisted CV experience. Packaged MV3 tests and assistive
technology identify the card, toggle its details and correlate the toggle with
the controlled region without using DOM position, CSS classes, visible
chevrons or unscoped text.

This model owns the card's semantic identity, local details projection and
focus while its subtree is connected. The parent CV workflow owns creation,
business edit/save/delete state, persistence and the focus destination after
the card is destroyed. Expansion never mutates an experience, writes storage,
invokes an LLM or decides whether an edit/save/delete succeeded.

## Immutable inputs and closed decoder

`experience` and `draft` cross the component boundary as immutable value
snapshots. `skills` is an immutable ordered sequence. The card takes an owned
copy of every accepted snapshot; neither the parent nor the card may mutate an
`Experience` object or its `skills` array in place. A changed value is delivered
as a replacement snapshot. An in-place mutation is an invalid integration and
cannot select a state transition.

The accessibility input signature is exactly this typed tuple, in this order:

```ts
type ExperienceAccessibilitySignature = readonly [
  id: string,
  title: string,
  company: string | null,
  description: string,
  skills: readonly string[],
  isEditing: boolean,
  draftId: string | null,
  isBusy: boolean,
  hasOnEdit: boolean,
  hasOnDelete: boolean,
  hasOnSave: boolean,
  hasOnCancelEdit: boolean,
];
```

Tuple equality is component-wise `Object.is`; `skills` equality additionally
requires the same length, order and component-wise values. It is not JSON,
delimiter concatenation, object identity or a hash. `draftId` is exactly
`draft?.id ?? null`; each `hasOn*` value is exactly
`typeof callback === 'function'`. Callback function identity is not a state
guard. Input decoding is single-event and ordered: a tuple difference emits
`EXPERIENCE_INPUT_CHANGED`, which already carries the latest references; when
the tuple is equal, the adapter compares the four callback references with
`Object.is`, and one or more differences emit exactly one
`CALLBACK_REFERENCE_CHANGED { nextExperience, nextDraft, nextCallbacks }`.
Only when tuple and callback references are equal may other snapshot differences
emit `EXPERIENCE_PRESENTATION_CHANGED`. Thus reference replacement is detected
even with an equal tuple without producing two input events.

Before first DOM projection, the adapter copies the initial full snapshot,
computes this tuple and runs the initial classifier below synchronously. There
is no separate mount event and no unclassified live state.

On every later replacement input update, the adapter first takes owned copies
of `nextExperience` and `nextDraft`, then computes the tuple. A tuple difference
emits exactly one
`EXPERIENCE_INPUT_CHANGED { previous, next, nextExperience, nextDraft,
nextCallbacks }` in that same update. The decoder handles every ordered
`(previous.isEditing, next.isEditing)` pair exactly once and in this priority
order:

1. `true -> false`: derive exactly one mutually exclusive
   `EDIT_EXITED_CHANGED` or `EDIT_EXITED_UNCHANGED`, then run the non-editing
   classifier. This rule has priority over, and is excluded from, the generic
   non-editing rule.
2. `false -> true`: derive `EDIT_STARTED`, then classify the new identity/draft
   pair as valid `editing` or fail-closed `unavailable`.
3. `true -> true`: derive `EDIT_INPUT_REPLACED`. A valid next draft always
   enters/remains `editing` with the new committed snapshot and new draft when
   identity is also valid. This includes recovery from
   `unavailable.invalid_edit_input` or
   `unavailable.draft_owner_mismatch`, same-ID replacement and replacement with
   a different experience ID. An invalid identity or next draft enters/remains
   the matching ordered `unavailable` reason. No previous invalid reason or
   stale draft can override the next owned copies.
4. `false -> false`: derive `DISPLAY_INPUT_REPLACED` and run only the
   non-editing classifier.

Within rules 3 and 4, a change is `capabilityOnly` exactly when
`id/title/company/description/skills/isEditing/draftId` are equal and at least
one of `isBusy/hasOnEdit/hasOnDelete/hasOnSave/hasOnCancelEdit` differs. A
`capabilityOnly` change derives `INTERACTION_CAPABILITY_CHANGED` instead of
`EDIT_INPUT_REPLACED`/`DISPLAY_INPUT_REPLACED`, retains the current machine
state and expansion, replaces the capability snapshot and reconciles controls.
When experience/edit fields and capability fields change together, the ordered
editing-pair transition runs once and capability reconciliation is one effect of
that transition, never a second state transition.

The edit comparison baseline is the five-field
`id/title/company/description/skills` tuple captured on `false -> true`, or the
initial five-field tuple when the component first mounts with `isEditing=true`.
`EDIT_EXITED_CHANGED` means at least one baseline value differs from the next
committed snapshot; `EDIT_EXITED_UNCHANGED` means all five are equal by the
exact equality above. The two exit events are intentionally named by observable
accessibility input, not “saved” or “cancelled”: saving unchanged data and an
external cancellation are indistinguishable at this boundary and have the same
deterministic projection. Business `SAVE_RESULT` remains parent-owned.

A replacement that changes only fields outside the signature emits
`EXPERIENCE_PRESENTATION_CHANGED`; it still replaces the owned full snapshot
and may refresh date, contract, location, source or draft fields, but is an
exact state self-transition. A tuple change limited to `isBusy` or `hasOn*`
derives `INTERACTION_CAPABILITY_CHANGED`; it preserves `display.collapsed` or
`display.expanded`, preserves `editing`/`unavailable`, updates controls and
applies the focused-control removal rule below. It never selects expansion.

`isEditing=true` with `draft=null` is invalid. A non-null draft whose `id` does
not equal `experience.id` is also invalid. Neither condition may fall through
to the display card or render a half-edit form; it enters `unavailable` with a
typed contract failure.

## Validated save payload and immutable merge

`EDIT_SAVE_REQUESTED` is not payload-free. It carries one owned copy of this
closed form value:

```ts
interface ExperienceFormData {
  title: string;
  company: string;
  employmentType: string;
  location: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  skills: string[];
}
```

“Plain object” is closed here: `Object.getPrototypeOf(payload) ===
Object.prototype`; `Reflect.ownKeys(payload)` contains exactly the nine string
keys above with no symbol, missing or additional key; and every key has an own,
enumerable data descriptor (no getter/setter). Shape inspection is confined so
a proxy trap throw becomes `INVALID_SAVE_PAYLOAD { field:'payload',
reason:'inspection_failed' }`. All five text fields are strings; `skills` is an
array containing only strings; the two date fields are string or `null`;
`isCurrent` is boolean. Validation then applies these closed rules:

The complete inspection, owned copy and normalization run inside that same
confinement; any proxy/iterator/property trap failure produces the same shape
failure and no callback.

```text
title        = trim(payload.title); required non-empty
company      = trim(payload.company); required non-empty
employment  = trim(payload.employmentType); empty -> null
location    = trim(payload.location); empty -> null
startDate   = trim(payload.startDate ?? ""); required YYYY-(01..12)
description = trim(payload.description)
skills      = payload.skills.map(trim).filter(non-empty), order/duplicates kept

if isCurrent=true:  payload.endDate must be null; endDate = null
if isCurrent=false: endDate = null or trimmed YYYY-(01..12)
```

The month regex is exactly `^[0-9]{4}-(0[1-9]|1[0-2])$`. Validation occurs
before any callback. `INVALID_SAVE_PAYLOAD { field, reason }` retains
`editing`, the owned draft and form values, and invokes no handler. The focus
target is the first failing item in this exact order: title -> `Titre du poste`;
company -> `Entreprise`; startDate -> `Début`; an invalid non-current endDate ->
`Fin`; skills -> `Compétences`; shape/type/inspection failure -> outer article.
The special contradiction `isCurrent=true && endDate!==null` uses reason
`current_requires_null` and focuses the enabled checkbox named `Poste actuel`,
never the disabled `Fin` input; if that checkbox is unexpectedly unavailable,
the deterministic fallback is the outer article.

For a valid payload, the card builds one deep immutable `Experience` candidate
by explicit field assignment:

```text
candidate.id               = ownedDraft.id
candidate.title            = title
candidate.company          = company
candidate.employmentType   = employment
candidate.location         = location
candidate.startDate        = startDate
candidate.endDate          = endDate
candidate.isCurrent        = payload.isCurrent
candidate.description      = description
candidate.skills           = immutable copy of normalized skills
candidate.source           = ownedDraft.source
candidate.sourceExternalId = ownedDraft.sourceExternalId
candidate.positionIndex    = ownedDraft.positionIndex
candidate.updatedAt        = ownedDraft.updatedAt
```

The normalized skills array is copied then `Object.freeze`d; the explicitly
constructed candidate is then `Object.freeze`d. No mutable reference from the
payload survives in either value.

No spread of the unvalidated payload is permitted. The nine editable values are
replaced exactly as stated; all five identity/provenance/order/timestamp values
are preserved exactly from the owned draft. The component generates no ID or
time and does not normalize business ordering. It passes this candidate once to
`onSave`; the parent remains responsible for persistence, a new `updatedAt`,
position recomputation and the later authoritative input replacement.

## Normalized projection

`trim(value)` means ECMAScript `String.prototype.trim()`, removing leading and
trailing ECMAScript whitespace without case folding or internal whitespace
collapse.

```text
normalizedTitle       = trim(experience.title)
normalizedCompany     = trim(experience.company ?? "")
normalizedDescription = trim(experience.description)
normalizedSkills      = experience.skills.map(trim).filter(value.length > 0)

displayTitle   = normalizedTitle.length > 0 ? normalizedTitle : "Sans titre"
displayCompany = normalizedCompany.length > 0
                   ? normalizedCompany
                   : "Entreprise inconnue"
cardName       = "Expérience " + displayTitle + " chez " + displayCompany
toggleName     = (display.collapsed ? "Afficher" : "Masquer")
                 + " les détails de l’expérience " + displayTitle
regionName     = "Détails de l’expérience " + displayTitle
hasDetails     = normalizedDescription.length > 0
                 || normalizedSkills.length > 0
```

Whitespace-only title/company therefore uses the stated fallback.
Whitespace-only description and skill values do not create a details control.
The normalized skills preserve source order and duplicates; no empty badge is
projected.

## Controlled-region identity

The component captures `$props.id()` exactly once at instance creation as
`instanceSuffix`. It is not recomputed on rerender and is never derived from an
experience ID, card index, rendered copy, random output, current time or an
LLM.

The provider value is accepted only when all of these exact rules hold:

```text
instanceSuffix regex  = ^[A-Za-z][A-Za-z0-9-]{0,63}$
instanceSuffix length = 1..64 ASCII code units, inclusive
detailsId             = "cv-experience-details-" + instanceSuffix
detailsId regex       = ^cv-experience-details-[A-Za-z][A-Za-z0-9-]{0,63}$
detailsId length      = 23..86 ASCII code units, inclusive
```

Before the first DOM projection, the component creates one in-memory object
reference `ownerLeaseToken` (identity only, not random data) and performs the
closed effect `reserve_details_id(document, detailsId, ownerLeaseToken)`. The
document-scoped registry returns exactly one result:

```text
reserved  registry had no detailsId; store detailsId -> ownerLeaseToken
owned     registry already had detailsId -> same ownerLeaseToken; idempotent success
collision registry had detailsId -> different ownerLeaseToken; do not mutate registry
```

Identity lease state is exactly `unvalidated | reserved | rejected | released`.
An invalid regex/bound skips reservation and becomes `rejected`; `collision`
also becomes `rejected`. A rejected instance never publishes the ID, never
retries with a modified value and never owns the winner's lease. A reserved
instance retains the lease through input replacement, busy/callback changes,
edit entry/exit and expansion.

Every identity rejection stores exactly one immutable diagnostic:

```text
reason = INVALID_DETAILS_ID | DETAILS_ID_COLLISION
diagnosticKey = reason + ":" + detailsId.length + ":" + detailsId
                + ":" + instanceSuffix.length + ":" + instanceSuffix
identityDiagnostic = { detailsId, reason, diagnosticKey, reported: boolean }
```

`report_contract_failure` replaces the immutable diagnostic snapshot once with
an otherwise identical `reported:true` snapshot; rerenders cannot report it
again. The key includes
the exact unsanitized `detailsId` and reason with length prefixes. On
`COMPONENT_DESTROYED`, a `reserved` owner performs
`release_details_id(document, detailsId, ownerLeaseToken)`: delete only when the
registry entry is the same token, then enter `released`. Rejected/unvalidated/
released destruction is an idempotent no-op and can never release another
instance's lease. If a supposedly reserved destroy finds no entry or a
different token, it emits `DETAILS_ID_RELEASE_MISMATCH`, leaves the registry
unchanged, reports once and terminates; it never deletes the foreign entry. The
document registry retains no successfully released entry.

The suffix is not persisted. A remount may receive a new suffix; the same
mounted instance keeps its exact reserved ID. Focused tests must prove distinct
simultaneous cards, collision rejection, exactly-once reporting and release on
destroy.

## State machine

```text
states:
  display
    collapsed
    expanded
  editing
  unavailable
  terminal

unavailableReason:
  no_details
  invalid_edit_input
  draft_owner_mismatch
  invalid_details_id
  details_id_collision

context:
  ownedExperience: immutable Experience
  ownedDraft: immutable Experience | null
  inputSignature: ExperienceAccessibilitySignature
  callbackReferences: latest onEdit/onDelete/onSave/onCancelEdit
  identityLease: unvalidated | reserved | rejected | released
  identityDiagnostic: immutable diagnostic | null
  nextInvocationId: positive integer
  settledInvocationIds: set of positive integers
  settlementRecords: map invocationId -> immutable intent/outcome/consumed
  settlementDiagnostics: map invocationId -> immutable diagnostic
```

The exact live state names are `display.collapsed`, `display.expanded`,
`editing` and `unavailable`; `terminal` is disconnected. Initial classification
is closed and ordered:

1. invalid `detailsId` -> lease `rejected`,
   `unavailable.invalid_details_id`;
2. reservation collision -> lease `rejected`,
   `unavailable.details_id_collision`;
3. `isEditing=true && draft=null` -> `unavailable.invalid_edit_input`;
4. `isEditing=true && draft.id!==experience.id` ->
   `unavailable.draft_owner_mismatch`;
5. valid `isEditing=true` -> `editing`;
6. `isEditing=false && hasDetails=true` -> `display.collapsed`;
7. otherwise -> `unavailable.no_details`.

### External and UI events

```text
EXPERIENCE_INPUT_CHANGED(previous, next, nextExperience, nextDraft, nextCallbacks)
EXPERIENCE_PRESENTATION_CHANGED(nextExperience, nextDraft, nextCallbacks)
CALLBACK_REFERENCE_CHANGED(nextExperience, nextDraft, nextCallbacks)
TOGGLE_REQUESTED(ownerInstanceSuffix, source: pointer | Enter | Space)
EDIT_REQUESTED
DELETE_REQUESTED
EDIT_SAVE_REQUESTED(payload: unknown)
EDIT_CANCEL_REQUESTED
PARENT_CALLBACK_FULFILLED(invocationId, intentKind)
PARENT_CALLBACK_FAILED(invocationId, intentKind, failureKind)
COMPONENT_DESTROYED
```

Only the native details button can produce `TOGGLE_REQUESTED`. Every toggle
event carries the mounted instance suffix and is accepted only by that owner.
There is no toggle event producer in `editing` or `unavailable`; a synthetic,
stale or foreign-owner toggle is a typed rejected event and exact no-op.

UI events are closed-world. The only authorized UI event/state pairs are the
rows explicitly marked accepted in the transition table. Every other
`TOGGLE_REQUESTED`, `EDIT_REQUESTED`, `DELETE_REQUESTED`,
`EDIT_SAVE_REQUESTED` or `EDIT_CANCEL_REQUESTED` is rejected synchronously,
keeps state/snapshot/focus unchanged and invokes no parent callback. In
particular, save/cancel received after edit exit are
`STALE_EDIT_INTENT`; any mutation intent while busy is
`MUTATION_INTENT_BUSY`; a missing callback is `INTENT_HANDLER_MISSING`. Native
controls for a rejected pair are
absent or disabled and non-focusable, so only a synthetic/stale caller can
produce the rejected event.

UI guard evaluation is closed and first-failure wins. Toggle checks owner,
allowed display state, reserved identity, then `hasDetails`. Mutation intents
check allowed state, `isBusy=false`, matching `hasOn*`, and valid draft ownership
when editing; save validates its payload last. Exactly one accepted effect or
one typed rejection results—never both.

### Parent callback confinement

Every callback has the closed runtime result contract
`void | PromiseLike<void>`. Accepted intent delivery uses a per-instance
monotonic integer `invocationId` starting at 1; it never uses time or randomness:

```text
intentKind  = edit | delete | save | cancel
failureKind = throw | reject | invalid_return
```

1. validate state, busy/capability guards and save payload when applicable;
2. capture the current callback reference and immutable argument;
3. allocate one `invocationId` and invoke once inside `try`;
4. synchronous throw calls `settleOnce(invocationId, 'throw')`;
5. synchronous return `undefined` calls `settleOnce(invocationId, 'fulfilled')`;
6. a non-`undefined` primitive or `null` calls
   `settleOnce(invocationId, 'invalid_return')`;
7. any non-null object/function result is passed directly to native
   `Promise.resolve(result)` inside `try`, without reading or invoking `.then`
   in component code; attach one fulfillment and one rejection handler;
8. asynchronous rejection calls `settleOnce(invocationId, 'reject')`, which
   emits `PARENT_CALLBACK_FAILED`; the rejection is consumed, so no unhandled
   rejection escapes;
9. fulfillment with value `undefined` calls
   `settleOnce(invocationId, 'fulfilled')`; fulfillment with any other value
   calls `settleOnce(invocationId, 'invalid_return')`.

`settledInvocationIds` is a per-instance set. `settleOnce` first checks the set,
adds the ID plus one immutable
`{ invocationId, intentKind, outcome, consumed:false }`
settlement record before emitting, and ignores every later settle attempt. A
settlement event is accepted only when every identity/outcome field equals that
record and `consumed=false`. Its single effect atomically replaces the record
with `consumed=true` and inserts one settlement diagnostic under that
`invocationId`. A replay sees `consumed=true` and is
`STALE_CALLBACK_SETTLEMENT`; an unknown or mismatched event has the same typed
exact no-op. No replay can overwrite the record or insert a second diagnostic.
Native `Promise.resolve` turns a hostile `then` getter throw into rejection and
obeys first-settlement wins for a thenable that calls fulfill/reject repeatedly;
the set is the second closed guard. A non-thenable object resolves to that
non-`undefined` object and is therefore `invalid_return`; a `PromiseLike<void>`
must fulfill with `undefined`. If the native assimilation call itself throws
synchronously, it is confined as `failureKind='throw'` through the same set.

The settlement diagnostic key is exactly
`instanceSuffix + ':' + invocationId + ':' + intentKind + ':' + outcome`, where
`outcome = fulfilled | throw | reject | invalid_return`. Fulfillment only proves
delivery; it never means edit/save/delete success and never changes card state,
busy state, snapshot or focus. Failure retains the same state/form/draft and
cannot invoke a retry. A later authoritative input replacement is the only
success projection.
Settlement after `terminal` is consumed and recorded as ignored without DOM,
focus or callback effects. Thus handlers are total at this boundary and no
throw/reject can escape or produce false success.

### Transitions

| Current state                           | Event / guard                                                                                               | Next state             | Effects                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `display.collapsed`                     | own `TOGGLE_REQUESTED`, `hasDetails`, reserved identity                                                     | `display.expanded`     | atomically set expanded semantics and mount the exact controlled region                                                  |
| `display.expanded`                      | own `TOGGLE_REQUESTED`, `hasDetails`, reserved identity                                                     | `display.collapsed`    | atomically set collapsed semantics and remove the exact controlled region                                                |
| either display                          | `EDIT_REQUESTED`, not busy, `hasOnEdit`                                                                     | same                   | confine one zero-argument `onEdit()` invocation; do not alter expansion                                                  |
| either display                          | `DELETE_REQUESTED`, not busy, `hasOnDelete`                                                                 | same                   | confine one zero-argument `onDelete()` invocation; do not alter expansion                                                |
| `unavailable.no_details`                | `EDIT_REQUESTED`, not busy, `hasOnEdit`                                                                     | same                   | confine one zero-argument `onEdit()` invocation                                                                          |
| `unavailable.no_details`                | `DELETE_REQUESTED`, not busy, `hasOnDelete`                                                                 | same                   | confine one zero-argument `onDelete()` invocation                                                                        |
| `editing`                               | `EDIT_SAVE_REQUESTED(payload)`, not busy, `hasOnSave`, valid owned draft and valid payload                  | `editing`              | construct the exact immutable merged candidate and confine one `onSave(candidate)` invocation                            |
| `editing`                               | `EDIT_SAVE_REQUESTED(payload)`, not busy, `hasOnSave`, valid owned draft, payload invalid                   | `editing`              | `INVALID_SAVE_PAYLOAD`; retain form/draft, invoke nothing and focus the exact invalid target                             |
| `editing`                               | `EDIT_CANCEL_REQUESTED`, not busy, `hasOnCancelEdit`, valid owned draft                                     | `editing`              | confine one zero-argument `onCancelEdit()` invocation                                                                    |
| any live                                | `EXPERIENCE_PRESENTATION_CHANGED` or `CALLBACK_REFERENCE_CHANGED`                                           | same                   | replace owned presentation/current handler references only                                                               |
| any live, editing flag unchanged        | `EXPERIENCE_INPUT_CHANGED`, `capabilityOnly` deriving `INTERACTION_CAPABILITY_CHANGED`                      | same                   | replace capability/handler snapshots, reconcile controls and delegate focus if a focused control becomes unavailable     |
| any live, previous `false`              | input change `false -> true` deriving `EDIT_STARTED`, valid reserved identity and next draft                | `editing`              | replace all owned inputs, reconcile capabilities, remove display semantics, project edit form and delegate removed focus |
| any live, previous `false`              | input change `false -> true` deriving `EDIT_STARTED`, invalid identity or next draft                        | matching `unavailable` | replace all owned inputs, suppress controls/form and report the exact integration failure                                |
| `editing` or invalid-edit `unavailable` | non-capability-only `true -> true` deriving `EDIT_INPUT_REPLACED`, valid reserved identity and next draft   | `editing`              | replace all owned inputs; reconcile controls, recover/project edit form and apply editing replacement focus              |
| `editing` or any invalid `unavailable`  | non-capability-only `true -> true` deriving `EDIT_INPUT_REPLACED`, invalid identity or next draft           | matching `unavailable` | replace all owned inputs, suppress controls and report the exact current failure                                         |
| any live, previous `true`               | input change `true -> false` deriving the exclusive changed/unchanged exit event                            | classified non-editing | replace all owned inputs, reconcile controls, remove edit/invalid projection and delegate removed focus                  |
| any live, previous `false`              | non-capability-only `false -> false` deriving `DISPLAY_INPUT_REPLACED`                                      | classified non-editing | replace all owned inputs, reconcile controls, close stale details and apply replacement focus rules                      |
| any live                                | correlated `PARENT_CALLBACK_FULFILLED` or `PARENT_CALLBACK_FAILED`, exact record match and `consumed=false` | same                   | mark record consumed and insert its one diagnostic; never project success                                                |
| any live                                | `PARENT_CALLBACK_FULFILLED` or `PARENT_CALLBACK_FAILED`, unknown, mismatched or already consumed            | same                   | `STALE_CALLBACK_SETTLEMENT`; exact no-op, no record/diagnostic/callback/DOM/focus effect                                 |
| any live                                | any UI event/state/guard pair not accepted above                                                            | same                   | typed rejection; exact no-op with no callback, focus or snapshot effect                                                  |
| any live                                | `COMPONENT_DESTROYED`                                                                                       | `terminal`             | delegate owned focus, release an owned reserved ID exactly once, then remove the subtree                                 |
| `terminal`                              | any, including late callback settlement                                                                     | `terminal`             | consume/ignore; no callback, timer, registry, DOM or focus effect                                                        |

Closed-world event audit for these exact bytes is exhaustive:

| Event family                                                    | Exhaustive table coverage                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `EXPERIENCE_INPUT_CHANGED`                                      | capability-only; false->true valid/invalid; true->true valid/invalid; exclusive true->false; non-capability false->false |
| `EXPERIENCE_PRESENTATION_CHANGED`, `CALLBACK_REFERENCE_CHANGED` | one live self-transition                                                                                                 |
| toggle/edit/delete/save/cancel UI events                        | every accepted row plus the explicit unauthorized-UI row                                                                 |
| `PARENT_CALLBACK_FULFILLED`, `PARENT_CALLBACK_FAILED`           | exact unconsumed correlation row plus explicit unknown/mismatched/consumed stale row                                     |
| `COMPONENT_DESTROYED`                                           | one live terminal transition                                                                                             |
| every event after `terminal`                                    | terminal catch-all                                                                                                       |

No other external event belongs to the declared union. A value failing the
strict event decoder never reaches the machine and produces
`EVENT_NOT_ALLOWED` with the same exact no-op guarantees.

“Classified non-editing” uses only initial-classifier rules 1, 2, 6 and 7 because
the decoder has already proved `next.isEditing=false`. The `true -> false` exit
row is exclusive and precedes every generic non-editing row; it can never also
run `DISPLAY_INPUT_REPLACED`. The `false -> false` row explicitly excludes a
prior editing input.

For `true -> true`, ownership is evaluated only against the next owned copies:
`nextDraft !== null && nextDraft.id === nextExperience.id`; identity validity is
then applied before edit projection. A valid identity/ownership replacement
always stays/recovers to `editing`, even after an invalid draft and even when the
experience ID changes. Same-ID replacement retains a still-connected focused
edit control. Recovery, different-ID replacement or removal of the focused edit
control delegates to the new `Titre du poste` input, falling back to the new
article, only when the card owned focus. An invalid replacement focuses the
resulting article only when removed edit content owned focus.

Reservation syntax/collision outcomes are consumed only by the synchronous
initial classifier; there is no public or late identity-rejection event that
could orphan a winning lease. Any accepted non-capability-only non-editing
experience-signature replacement closes an expanded region before projecting
changed content. No transition waits for free text, an animation, network
completion or an LLM.

## Required DOM contract

Every nonterminal state renders exactly one outer card with:

```text
role="article"
aria-label=cardName
tabindex="-1"
```

The article name always comes from the committed `experience` snapshot, never
the mutable edit draft. This exact article contract remains in `editing` and
`unavailable`; edit mode does not substitute an unnamed form container. The
`tabindex` adds no sequential keyboard stop and exists only as the deterministic
programmatic focus fallback.

### `display.collapsed` and `display.expanded`

Exactly one native button owns details expansion and has:

```text
aria-label=toggleName
aria-expanded="false" | "true"
aria-controls=detailsId
```

The title/company/date summary may remain inside this button. Edit and delete
are separate native buttons and never inherit `aria-controls`, produce
`TOGGLE_REQUESTED` or alter this card's/current/another card's expansion.
Each mutation button exists only when its matching callback exists and is
disabled/non-focusable while `isBusy=true`. `isBusy` never disables, clicks or
toggles the details button implicitly.

In `display.expanded`, exactly one visible controlled element exists:

```text
id=detailsId
role="region"
aria-label=regionName
```

It contains the normalized non-empty description and every normalized skill
badge. In `display.collapsed`, no element with `id=detailsId` exists.

### `editing`

The same named article contains exactly one edit form backed by the valid draft.
No stale details toggle, `aria-expanded`, `aria-controls` or details region is
present. Save and cancel are edit-form controls only; pointer, Enter and Space
on either can produce only their corresponding edit intent and can never toggle
this or another experience. A save/cancel control exists only with its matching
callback and is disabled/non-focusable while busy. The card transfers exactly
the validated immutable merged candidate to `onSave` and transfers cancel to
`onCancelEdit`; callback fulfillment/failure never selects a transition.

### `unavailable`

The committed summary is a noninteractive element, never a button or a
`TOGGLE_REQUESTED` producer. There is no element with `aria-expanded`,
`aria-controls` or `id=detailsId`.

For `unavailable.no_details`, separately owned edit/delete buttons use the same
closed rule as display: each exists iff its matching callback exists, is
disabled/non-focusable while busy, and an accepted activation transfers exactly
one zero-argument callback. The noninteractive summary never receives that
activation.

Invalid edit, draft-owner and identity reasons have one projection only: the
named noninteractive committed summary remains, every toggle/edit/delete/form/
save/cancel control is suppressed, and the typed integration failure is
reported. Exactly-once immutable diagnostic-key de-duplication applies only to
identity rejection, using the key defined in Controlled-region identity.
`INVALID_EDIT_INPUT` and `DRAFT_OWNER_MISMATCH` report once for each accepted
initial classification or `EXPERIENCE_INPUT_CHANGED` transition that enters or
remains in that reason; a rerender without an input event reports nothing, and
there is no cross-transition de-duplication claim. “Disabled instead of
suppressed” is not an implementation option. The card never pretends editing
succeeded.

`terminal` renders no article, control or region.

## Keyboard, focus ownership and delegation

The native toggle maps one pointer activation, one Enter activation or one
Space activation to exactly one owner-correlated `TOGGLE_REQUESTED`. Expansion
and collapse do not move focus: if the toggle remains connected, it retains
focus.

While connected, the card owns focus only when `document.activeElement` is the
article or one of its descendants. A transition that removes the focused node
must delegate exactly once after the replacement DOM commit and no later than
the next Svelte update:

| Removal cause                                                                     | Deterministic target                                                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| collapse while focus is in the details region                                     | this card's still-connected toggle                                                                        |
| same-experience replacement that removes the toggle or focused details child      | this card's outer article                                                                                 |
| replacement with a different `experience.id`                                      | the replacement card's outer article; focus never silently transfers to its semantically different toggle |
| entry into `editing`                                                              | the edit input labeled `Titre du poste`, or the outer article if that exact input is disabled/unavailable |
| invalid-edit recovery to `editing`                                                | the recovered edit input labeled `Titre du poste`, or the outer article if unavailable                    |
| same-ID replacement while remaining `editing`                                     | retain a connected focused edit control; otherwise the `Titre du poste` input, then article fallback      |
| different-ID replacement while remaining `editing`                                | the replacement edit input labeled `Titre du poste`, then article fallback                                |
| exit from `editing`                                                               | the resulting outer article                                                                               |
| invalid-input transition to `unavailable`                                         | the resulting outer article                                                                               |
| display/no-details `hasOnEdit/hasOnDelete: true -> false` with its button focused | this card's outer article                                                                                 |
| display/no-details `isBusy: false -> true` with edit/delete focused               | this card's outer article                                                                                 |
| editing `hasOnSave/hasOnCancelEdit: true -> false` with its control focused       | `Titre du poste` when enabled, otherwise this card's outer article                                        |
| editing `isBusy: false -> true` with save/cancel focused                          | `Titre du poste` when enabled, otherwise this card's outer article                                        |
| `COMPONENT_DESTROYED`                                                             | parent-owned exit target selected before disconnection                                                    |

Capability reconciliation computes each control from the new tuple before focus
delegation. Adding a callback, clearing busy, replacing a callback reference or
changing an unfocused control never moves focus. If a simultaneous state/input
transition and capability change both remove the focused node, delegation
occurs exactly once using this priority: destruction target; edit/replacement/
unavailable target; capability-only target. Callback settlement never moves
focus.

For destruction, the component emits one synchronous
`FOCUS_EXIT_REQUESTED { experienceId, positionIndex }` only if it owns focus.
The parent owns the target and selects the first connected target in this exact
order: next experience article by ascending rendered position, previous
experience article, `Ajouter une expérience`, then the CV page heading with
`tabindex=-1`. The parent focuses it after removal in the same update or the
immediately following microtask. Falling through to `document.body`, guessing a
CSS selector, or leaving focus on a disconnected node is a contract failure.
No focus event from one card may change another card's expansion.

## Semantic convergence and animation

For every accepted transition, machine state, `aria-expanded`, toggle name and
controlled-region presence commit atomically in one Svelte DOM update. At no
point after that commit may `aria-expanded=true` exist without the exact region,
or the region exist while `aria-expanded=false`.

A visual transition may continue after the semantic commit, but it cannot keep
a stale accessible duplicate, dispatch a state event or be awaited as transition
authority. There is no `transitioning` state, no `transitionend` dependency and
no indefinite intermediate state. Focus delegation is bounded as stated above.

## Effects and errors

Allowed effects are closed:

```text
project_card_semantics
project_toggle_semantics
mount_exact_details_region
unmount_exact_details_region
reserve_details_id
release_details_id
reconcile_interaction_controls
validate_save_payload
construct_immutable_save_candidate
forward_parent_edit_intent
forward_parent_delete_intent
forward_parent_save_intent
forward_parent_cancel_intent
confine_parent_callback_result
record_callback_diagnostic
focus_owned_target
request_parent_focus_exit
report_contract_failure
```

Typed failures are:

```text
INVALID_EDIT_INPUT          isEditing=true with draft=null
DRAFT_OWNER_MISMATCH        draft.id !== experience.id
INVALID_DETAILS_ID          suffix/full ID violates exact regex or bounds
DETAILS_ID_COLLISION        two live instances publish the same detailsId
DETAILS_ID_RELEASE_MISMATCH reserved destroy no longer owns the registry entry
FOREIGN_TOGGLE_OWNER        event owner differs from mounted instance suffix
TOGGLE_UNAVAILABLE          toggle event received outside display states
EVENT_NOT_ALLOWED           UI event/state/guard pair absent from the accepted table
STALE_EDIT_INTENT           save/cancel arrives outside editing
MUTATION_INTENT_BUSY        edit/delete/save/cancel arrives while busy
INTENT_HANDLER_MISSING      requested callback is absent
INVALID_SAVE_PAYLOAD        save form fails the exact closed validator
PARENT_CALLBACK_THROW       accepted callback throws synchronously
PARENT_CALLBACK_REJECTED    accepted callback rejects asynchronously
INVALID_CALLBACK_RESULT     primitive/null return or assimilation fulfills non-undefined
STALE_CALLBACK_SETTLEMENT   settlement is unknown, mismatched or already consumed
FOCUS_EXIT_TARGET_MISSING   parent cannot supply any ordered destruction target
```

`STALE_EDIT_INTENT`, `MUTATION_INTENT_BUSY`, `INTENT_HANDLER_MISSING`,
`EVENT_NOT_ALLOWED`, `FOREIGN_TOGGLE_OWNER`, `TOGGLE_UNAVAILABLE` and
`STALE_CALLBACK_SETTLEMENT` are typed exact no-ops: no callback, focus, snapshot
or DOM effect. `STALE_CALLBACK_SETTLEMENT` additionally inserts no diagnostic
and changes no settlement record. Integration failures never toggle, persist,
invoke an LLM or mutate an input. Contract failures are deterministic
diagnostics; visible free-form error copy never selects recovery. Callback and
release failures are confined and consumed as specified; none can escape the
component boundary.

## Invariants

1. Every nonterminal card exposes exactly one article named from its immutable
   committed experience; terminal exposes none.
2. Only `display.collapsed`/`display.expanded` expose one owner-correlated
   native toggle. `editing` and `unavailable` expose none.
3. At most one details region exists per card. A live `aria-controls` resolves
   to it exactly when `aria-expanded=true`.
4. Every controlled ID matches the exact 23..86-character ASCII contract, is
   backed by one live owner lease and is released by that owner on destruction;
   a collision never overwrites or releases the winner.
5. Any accepted non-capability-only non-editing experience-signature change or
   edit exit starts collapsed when details remain; capability-only changes
   preserve expansion.
6. `isEditing=true` without a same-owner draft cannot render display or edit
   controls and must fail closed with the single suppressed-control
   `unavailable` projection.
7. Edit, delete, save, cancel, busy and foreign-card events never toggle the
   current card or any other card.
8. A removed focused node has exactly one bounded deterministic focus target;
   destruction focus is parent-owned.
9. Visible text queries, DOM ancestry outside the named article, card order,
   CSS state, animation callbacks, timers, storage, network results and LLM
   output never decide a transition.
10. The molecule imports no state module, performs no persistence/network I/O
    and never mutates `Experience` or `skills`.
11. Every `EXPERIENCE_INPUT_CHANGED` is handled by exactly one of the four
    ordered editing-pair rules; `true -> true` always replaces owned snapshots
    and can recover invalid editing, and `true -> false` never also takes the
    generic display rule.
12. Every unauthorized UI event is a typed exact no-op. An allowed parent
    callback is transferred exactly once and only from its accepted state/guard
    pair.
13. Busy/callback availability is part of the exact input signature. Removing
    or disabling the focused control delegates focus once; callback reference
    replacement or capability addition moves nothing.
14. A save handler receives only the validated, explicitly merged immutable
    candidate; all non-form draft fields are preserved and no payload spread,
    generated ID or generated time is permitted.
15. Callback fulfillment never projects success. Every throw/rejection is
    consumed into one typed invocation diagnostic and state changes only from a
    later authoritative input replacement.
16. Every identity rejection has one immutable key containing exact reason and
    details ID, reports exactly once, and reserved destruction releases exactly
    once.
17. A correlated settlement is accepted only while its exact record is
    unconsumed, atomically consumes it and inserts one diagnostic. Unknown,
    mismatched and replayed settlement events are stale exact no-ops.

## Preserved packaged checkpoint A3 contract

Revision 5 preserves and strengthens the exact packaged A3 contract. After the
saved experience is reloaded, the packaged scenario can resolve only:

```text
role=article, accessible name="Expérience Lead Packaged UI chez MissionPulse QA"
toggle accessible name="Afficher les détails de l’expérience Lead Packaged UI"
toggle aria-expanded=false -> true after exactly one click
toggle aria-controls=<stable unique detailsId matching the exact bounded regex>
controlled role=region, accessible name="Détails de l’expérience Lead Packaged UI"
skills Svelte, TypeScript and Playwright scoped inside that controlled region
```

The action must not use card index, `nth`, DOM ancestry outside the named
article, CSS class, pixel position or visible-text guessing. The same mounted
instance keeps the exact controlled ID across the action.

## Independent review and RED scenarios

Implementation remains forbidden until an independent reviewer recomputes the
hash and approves these exact revision-5 bytes. Implementation must then begin
with failing tests for:

1. the exact packaged A3 article, collapsed toggle, bounded controlled ID,
   one-click expansion, matching named region and three scoped skills;
2. collapse removing the exact region atomically while the toggle retains
   focus;
3. pointer, Enter and Space each producing exactly one transition;
4. two simultaneous cards receiving distinct IDs that match the full regex and
   23..86 bounds;
5. invalid/oversized/non-ASCII suffix and live collision failing closed without
   sanitization or toggle semantics;
6. whitespace-only title/company fallbacks and whitespace-only details producing
   `unavailable.no_details` with a noninteractive summary;
7. `isEditing=true` with no draft and a wrong-owner draft each producing the
   typed unavailable state, never a half-edit/display card;
8. edit entry removing stale expanded semantics, keeping the named article and
   delegating owned focus to `Titre du poste`;
9. changed and unchanged edit exits each taking exactly one exclusive exit rule,
   never the generic display rule, and returning collapsed/unavailable with
   focus on the article;
10. every `true -> true` case: valid same-ID edit replacement, valid
    different-ID replacement, invalid draft, invalid owner, and invalid-to-valid
    recovery with exact owned snapshots and focus;
11. immutable replacement and component-wise signature changes emitting one
    input event, with no in-place mutation path;
12. replacement while expanded removing stale details, preserving the mounted
    ID, and applying the exact same/different-experience focus rules;
13. no-details edit/delete controls transferring exactly one callback when
    present/enabled and producing no toggle;
14. stale/busy/missing-handler save/cancel plus every other unauthorized UI
    event producing its typed exact no-op with no callback;
15. state, toggle name, `aria-expanded` and region presence converging in one
    DOM update even while visual animation continues;
16. destruction with owned focus delegating through the parent's exact ordered
    targets, and destruction without owned focus moving nothing;
17. terminal ignoring all late events and leaving no article or controlled
    region;
18. each callback-presence boolean and `isBusy` entering the exact signature;
    callback removal and `isBusy:false -> true` each delegate a focused control
    once without collapsing expanded details, while capability addition moves
    nothing;
19. callback reference replacement with an otherwise equal tuple emitting one
    `CALLBACK_REFERENCE_CHANGED`, retaining focus/state and using only the new
    handler on the next intent;
20. valid `ExperienceFormData` constructing every editable field, preserving all
    five non-form draft fields and proving both candidate and candidate skills
    are frozen with no surviving payload reference;
21. save payload rejection for wrong prototype, missing/extra string key, symbol
    key, accessor property, non-enumerable property, wrong type, invalid month
    and a throwing Proxy trap; plus `isCurrent=true/endDate!=null` focusing
    `Poste actuel` (article fallback), retaining edit state and invoking no save
    handler;
22. callback `undefined`, fulfilled thenable, synchronous throw, rejected
    thenable, non-void fulfillment, hostile throwing `then` getter and a
    thenable calling fulfill/reject multiple times; each settles once without
    false success, retry or unhandled rejection, including after destroy;
23. one correlated settlement changing `consumed:false -> true` and inserting
    one diagnostic, then identical replay, unknown ID and mismatched outcome all
    producing `STALE_CALLBACK_SETTLEMENT` exact no-ops with no double record;
24. identity reservation success/idempotence/collision, one diagnostic per
    rejected instance with exact key fields, winner preservation, owner release
    on destroy and release-owner mismatch never deleting a foreign entry.

Verification requires focused component tests, transition/invariant tests,
identity-registry and callback-confinement tests, TypeScript/Svelte checks and
the packaged A3 checkpoint using only the accessible contract above.
