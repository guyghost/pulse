# MV3 packaged harness model

Status: **proposed — persistent-session CDP lease revision 26**.
Pending behaviour SHA-256: `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`.

Hash convention: compute SHA-256 over all raw UTF-8/LF bytes of this file after
replacing only the value between backticks on the `Pending behaviour SHA-256`
line with the literal `__PENDING_BEHAVIOUR_SHA256__`; the surrounding backticks,
period and every other byte remain unchanged. The reviewer must reproduce that
substitution before comparing the digest, so recording the digest creates no
self-referential cycle.

Revision 25 was independently rejected at normalized UTF-8/LF behaviour hash
`84bc0ce47cb24d9fd998970daca04fbe6553931ede2b1be272348a16e665255f`:
two earlier hostile-test labels still named revision 24. Revision 26 replaces
all current proof labels with stable references to this pending revision; only
the historical ledger retains explicit superseded revision numbers.

Revision 24 was independently rejected at normalized UTF-8/LF behaviour hash
`494464489184b4c7075fece27d581c71ee9d75b0bb989858abff9f790603842a`:
three final-obligation labels still named revision 23 despite the corrected
revision-24 authority bytes. Revision 25 corrects those remaining labels only.

Revision 23 was independently rejected at normalized UTF-8/LF behaviour hash
`96f913a4ce21c0c07c20499d3ec4d966fe375baf1a49cfa56e7992f2b2f3b917`:
two hostile-test labels still named revision 22 and one invariant incorrectly
required a failed-connect transport close before the lease that necessarily
owned it. Revision 24 corrects those normative labels without changing the
source-bound authority behavior.

Revision 22 was independently rejected at normalized UTF-8/LF behaviour hash
`942ea53ff3c0960ba7d029174c1ec47d2797e335f1e45fd5dc26115ce39fb2cf`:
its event DTO/hash was not compared with the retained raw authority, so a
self-consistent foreign DTO could reserve the Playwright lease. Its final
obligation also conflated the hostile matrix with nominal Chrome repetitions.
Revision 23 resolves both findings below.

Revision 21 was independently rejected at normalized UTF-8/LF behaviour hash
`0694b990c2c8c8329697c05e6711fa53520b1071bf4e6e931bd6553ba60e6a88`:
its success event omitted the DTO, its no-owner receipt was not closed, hostile
reflection exceptions escaped the typed error union, and one final obligation
still named revision 19. Revision 22 resolves those four findings below.

Revision 20 was independently rejected at normalized UTF-8/LF behaviour hash
`c1131e755549170e09f747fd06b09ced7f2f7778087bcb39a50d72a80f442222`:
the authority projection was not represented in the outer machine, its rejection
cleanup was ambiguous after transport allocation, and its error/test matrix was
not closed. Revision 21 resolves those three findings below. No approval
transfers from any earlier revision.

Revision 19 was independently approved at raw UTF-8/LF behaviour hash
`ba1e91ea1af5fc802c2d9f026a1ce97fa16750e244c71677ed9cebcfaf67b458`,
then verified by four real Chrome-for-Testing 149 same-session restart runs. The
canonical packaged runtime scenario subsequently falsified its Playwright
handoff boundary as described below. No approval transfers to revision 20, and
implementation is forbidden until an independent review approves the exact
pending raw UTF-8/LF behaviour hash above.

Revision 18 was independently approved at raw UTF-8/LF behaviour hash
`a0f201a6273feb1edd51b024330f54534eed9b1890c2587690a81ab011e0521d`,
then falsified by the real same-session paused-bootstrap command ordering
described below. No approval transfers to revision 19, and implementation is
forbidden until an independent review approves the exact pending raw UTF-8/LF
behaviour hash above.

Revision 16 was independently approved at raw UTF-8/LF behaviour hash
`f374bdaa20cedbea1be9abccfe53c39f6ede7c47a1df8126c64623f71cc96927`,
then falsified by the first real paused-bootstrap probe ordering described
below.

Revision 17 was independently rejected at raw UTF-8/LF SHA-256
`142b65a82c492f895a31bcb697c16f34e24c2bb87780d9c422f90a7c9a53025f`
because an exact selected-version `running` update could arrive during the
probe/resume batch but was defined only in `resuming`. Revisions 18 and 19
retain that native proof idempotently in every bootstrap-batch state as
specified below.

Revision 14 was independently approved for raw UTF-8/LF behaviour hash
`69caaba95c035ce51d6d549252884c3a2893a8146d15355eac0df57b17866fba`,
then falsified by the real post-reload Runtime ordering described below.
Revision 15 was independently rejected at raw UTF-8/LF SHA-256
`0e701a15bef6b9ddef15ac26b1232c976404d9a08dee8ee1783087b8675b15cc`
because a post-crash `executionContextDestroyed` ID was counted but not
tombstoned, allowing a later context creation to restore destroyed authority.

Revision 9 was independently approved at pending raw UTF-8/LF SHA-256
`3cfeb1d001cc1ae98d9a79139ed01f8eebfba5cbc724b4a410e2a4d0c47e7dc1`,
then falsified by all three real packaged-Chrome repetitions. Revision 10 was
rejected during independent review before implementation because it still
expected a new target attachment for a same-version restart. No approval
transfers to revision 11. Revision 12 superseded rejected pending revision-11
hash `956e31105c1c6f33b916f8bc161de0ff357f07464eb040b8214ec1082d29d2e8`
and remained pending at raw UTF-8/LF SHA-256
`c1a66bdb5341b6118d9eda5d17de478b83abe98ecebc9ded7cbd9019f6e85617`.
Repeated real Chrome 149 traces now falsify revision 12 as described below;
revision 12 cannot be approved or implemented as written. Revision 13
superseded it and was independently approved at raw UTF-8/LF SHA-256
`23fa088bca21bf9ad191adb7f6fbdb469112b762bdb3a624c992bbbac1fcfa1d`.
A real packaged-Chrome smoke then rejected a valid repeated replacement-version
update because the implementation incorrectly treated the proof as one-shot.
Revision 14 made the already intended idempotent metadata semantics explicit
and was approved at the hash recorded above before its later native-ordering
falsification.

Revision date: 2026-07-17

## Scope

This model owns only verification of the exact sealed
`apps/extension/dist` package in a real Chromium Manifest V3 process. It does
not change product behavior or application state. The canonical entry point
remains `pnpm --filter @pulse/extension test:mv3`.

The model separates two claims that must never be conflated:

1. **instrumented bootstrap**: a raw CDP owner installs Runtime and diagnostic
   observers before a restarted worker is resumed;
2. **functional restart**: after Playwright has exercised the extension, the
   same Chromium process and profile are handed back to the raw owner, restarted,
   reconnected to Playwright, and verified for persisted settings, IndexedDB and
   alarms.

A restart performed while Playwright still owns a CDP connection can prove only
functional behavior, never pre-bootstrap instrumentation. Revision 13 therefore
forbids that topology rather than weakening the native pause proof.

## Revision-9 falsification evidence

The command below failed three times before any UI interaction:

```text
playwright test --config=playwright.mv3.config.ts
  tests/e2e-extension/navigation.test.ts
  --grep "cold boot shows the packaged onboarding without DEV stubs"
  --repeat-each=3
```

The traces establish two independent modes:

1. the base run and repeat 1 failed during initial authority acquisition, before
   any `stopWorker` or `startWorker`; revision 9 treated either a transient
   overlapping non-redundant version or the provisional version becoming
   `redundant` as immediately terminal;
2. repeat 2 froze registration `0`, version `0` and target
   `6E5F00D02842631CE14197B441F1B3D7`, stopped and detached it, then Chrome
   restarted the same version with the same target ID but emitted no replacement
   `Target.attachedToTarget` or `Runtime.executionContextCreated` to the second
   raw connection.

The second result is explained by the real owner topology. Playwright 1.61.1
arms its own root `Target.setAutoAttach` while connecting
(`playwright-core/lib/coreBundle.js:37742-37773`). Its `CRServiceWorker`
immediately sends `Runtime.enable` and `Runtime.runIfWaitingForDebugger`, and
does so again after a worker reload (`coreBundle.js:37591-37633`). The raw
observer was therefore not the sole pause/resume authority.

Revision-11 hypotheses are deliberately falsifiable:

- **H11.1**: when the raw connection is the only harness-created root CDP
  transport and its exact service-worker session remains attached through
  `stopWorker`/`startWorker`, Chromium reuses that agent host, emits
  `Inspector.targetCrashed` then `Inspector.targetReloadedAfterCrash`, and pauses
  the replacement before bootstrap because the host was attached at worker
  creation;
- **H11.2**: initial installation may transiently expose multiple related
  versions, but converges under one deadline to one activated non-redundant
  version while all older related versions become redundant;
- **H11.3**: `browser.close()` on a `connectOverCDP` Browser closes only that
  Playwright transport, so the same manually owned Chromium process and profile
  can be leased back to raw CDP and later reconnected.

If any hypothesis fails in deterministic tests or any of three real repetitions,
implementation stops and returns to model review. There is no fallback to a
detached old worker session, a guessed new target attachment, an unproved
warm-up start, a new browser process or a new profile.

## Revision-12 falsification evidence and revision-13 decision

Repeated real traces with the pinned Chrome for Testing 149 build falsify the
revision-12 stop proof. On the retained selected target and session, every trace
observed all three native stop facts:

1. the correlated `ServiceWorker.stopWorker` response succeeded;
2. the same selected version became `status:activated` and
   `runningStatus:stopped`;
3. the selected session emitted `Inspector.targetCrashed` for the same target.

No trace emitted `Runtime.executionContextDestroyed` or
`Runtime.executionContextsCleared`, including repeated observation windows from
8 through 30 seconds after the crash. Waiting longer therefore adds elapsed
time, not evidence. Revision 12 made progress depend on a Runtime lifecycle
event that this native same-session stop does not emit and is falsified.

The same Chrome 149 traces establish a second native contract for the
replacement: `Runtime.executionContextCreated.context.origin` equals the full
frozen worker `scriptURL`
(`chrome-extension://<extensionId>/service-worker-loader.js`), not the root
scope with its trailing slash removed. Revision 12 did not make `origin` a stop
proof, so this does not replace the crash falsification above; it does reject a
scope-derived context guard.

Revision 13 treats the exact current `Inspector.targetCrashed` event as the
native context-generation boundary. One atomic XState action on that event:

1. freezes the crash event hash against the selected target and session;
2. increments the selected session's monotonic `contextGeneration` exactly once;
3. moves every `uniqueContextId` admitted in the pre-crash generation, whether
   still active or already inactive, into the bounded append-only
   `revokedUniqueContextIds` tombstone set and freezes its canonical set hash;
4. clears the active-context authority map for that session; and
5. marks the crash/revocation proof complete in the same transition.

No pre-crash context remains current after that action. A revoked
`uniqueContextId` can never satisfy `isCurrentContext`, authorize a probe or be
passed to `Runtime.evaluate`, even if Chromium later repeats its bytes. A late
`Runtime.executionContextDestroyed` or `Runtime.executionContextsCleared`
reduced while the actor remains in `controlled_stop` is normalized as retired
evidence only; it neither creates nor completes a stop proof and cannot select a
transition. After the crash, every valid destroyed `uniqueContextId` that is not
already in that crash set is retained in a separate bounded post-crash tombstone
set. Outside `controlled_stop`, revision 16 permits only the narrow post-reload,
pre-context window defined below; every other such event is terminal because it
carries no trustworthy context-generation discriminator.

The replacement proof remains fail-closed. It requires
`Inspector.targetReloadedAfterCrash` on the same target/session while the same
frozen version remains selected before admitting any replacement context,
followed by exactly one new
`Runtime.executionContextCreated` on that retained session. Its non-empty
`uniqueContextId` must belong to the incremented generation and must occur in
neither `revokedUniqueContextIds` nor
`postCrashDestroyedUniqueContextIds`, and its `origin` must equal the exact
frozen `scriptURL`. A context before reload, a scope-derived or otherwise
mismatched origin, an old or destroyed ID reused after reload, a second
replacement context, a new selected attachment, a detach or any
target/session/version drift is terminal.
No absence, delay or locally cleared boolean substitutes for these positive
native proofs.

After independent approval of revision 13, any implementation derived from
revision 12 must replace a `scopeURL`-derived context-origin guard with the exact
frozen `scriptURL` rule. This model edit does not authorize that implementation
change before approval.

## Revision-13 implementation falsification and revision-14 decision

The first real packaged-Chrome smoke of the revision-13 implementation reached
the full native stop proof, then emitted this same-version replacement sequence
on the retained registration, target and session:

1. `activated/starting` without `targetId`;
2. `activated/starting` again with the exact frozen `targetId`.

The first update completed the implementation's boolean replacement-version
proof. Its one-shot guard then sent the second valid update to failure solely
because that proof was already true. This contradicts the transition-table
requirement to retain current same-version starting/running updates and makes a
normal Chrome metadata enrichment terminal.

Revision 14 separates identity admission from repeated metadata observation.
The first current update with exact registration/version/script identity,
`status='activated'`, `runningStatus in {'starting','running'}` and either no
`targetId` or the frozen target completes the replacement-version proof. Every
later update satisfying the same guard remains admissible. An exactly repeated
record is an exact no-op. A valid `starting -> running` change or addition of the
exact frozen `targetId` may refresh non-authoritative current metadata, but it
does not allocate a second proof, change restart/context generation, replace
frozen identity or authorize progress by itself. A different registration,
version, script, status, target, or any other running status remains terminal.

## Revision-14 falsification evidence, revision-15 rejection and revision-16 decision

After rebuilding and verifying the exact production `dist`, the next real
packaged-Chrome smoke completed stop and emitted this retained-session order:

1. `Inspector.targetReloadedAfterCrash`;
2. `Runtime.executionContextsCleared`;
3. `Runtime.executionContextCreated` with a fresh non-revoked `uniqueId` and
   exact full-script origin.

Revision 14 made step 2 terminal merely because the machine had left
`controlled_stop`. That rejects Chrome's native reload initialization before
any replacement context authority exists.

The first revision-15 proposal counted both lifecycle events without retaining
the native destroyed unique ID. Independent review rejected it: a later
`executionContextCreated` could reuse that unrecorded ID and restore authority
that Chrome had already destroyed. Revision 16 closes that hole as follows.

Revision 16 admits a bounded retired-generation Runtime lifecycle event only
when every guard below is true:

- process generation, lease epoch and selected session are current;
- the exact same-session `targetReloadedAfterCrash` proof is already retained;
- no replacement context has been observed or frozen yet;
- the event is `executionContextsCleared` or `executionContextDestroyed`.

`Runtime.executionContextsCleared` updates the bounded retired-evidence counter
only. `Runtime.executionContextDestroyed` must additionally carry its native
non-negative safe-integer `executionContextId`, a non-empty normalized
`executionContextUniqueId` of at most 512 UTF-8 bytes with no NUL, CR or LF, and
the SHA-256 of the complete schema-validated parameters. If that unique ID is
not already in `revokedUniqueContextIds`, the same transition appends it to
`postCrashDestroyedUniqueContextIds` and recomputes
`postCrashDestroyedUniqueContextIdsSha256` over RFC 8785 JCS of the sorted set.
The set starts empty in the atomic crash transition. Its IDs share the single
4,096-entry execution-context authority budget with crash tombstones and the
fresh replacement context. A duplicate destroyed ID is idempotent but its event
still consumes one of the 4,096 bounded retired-evidence observations. A
malformed or over-budget destroy/clear is terminal and can never authorize
progress.

Neither event can complete start, Runtime, version, context or identity proof;
increment `contextGeneration`; mutate the crash-time revoked-ID set/hash; clear
the reload proof; or authorize a probe or transition. The first admissible fresh
context closes the window atomically and must be absent from both tombstone
sets. Once `replacement_starting` begins, the same lifecycle event before
reload, after a fresh context, on another session, or in any later probe/resume
state is terminal. Thus Chrome may
announce that the reloaded Runtime cleared its old execution world, while a
later context creation can never restore an authority that Chrome already
destroyed.

## Revision-16 falsification evidence and revisions 17-18 decisions

After the revision-16 deterministic suite passed, a real production-package
Chrome run reached the exact same-session sequence required by that revision:

1. `Inspector.targetReloadedAfterCrash`;
2. `Runtime.executionContextsCleared`;
3. one fresh `Runtime.executionContextCreated` with exact script origin.

The owner then sent the fixed identity `Runtime.evaluate` and awaited its reply
before sending `Runtime.runIfWaitingForDebugger`. That evaluation never settled
within the 30-second absolute raw deadline. The replacement trace emitted no
`Inspector.workerScriptLoaded` before the wait and later returned to
`targetCrashed/stopped`. The positive evidence is that the replacement context
exists while the worker is still paused on start; evaluating bootstrap globals
cannot be awaited to completion before the only command that releases that
pause. Revision 16 therefore encodes a causal deadlock even though its context
authority proof is correct.

Revision 17 proposed changing the fixed bootstrap command effect. Revision 18
kept every revision-16 identity and tombstone rule and, after closing the
revision-17 selected-version metadata gap, dispatched one synchronous
tracked-client batch in this exact order without awaiting any reply between
sends:

1. the fixed identity `Runtime.evaluate`;
2. the optional explicit test `Runtime.evaluate`, only when the machine's
   frozen `testProbeConfigured` input is true;
3. exactly one `Runtime.runIfWaitingForDebugger`.

All commands target the retained selected session. Both evaluations use the
same frozen fresh `uniqueContextId` and the exact parameters defined below. The
tracked client sends each command synchronously before returning its promise,
so the evaluation command bytes are queued before resume bytes even though the
evaluation replies require resume. With no other command producer in this
state, successful receipts must carry strictly consecutive monotonic IDs in the
dispatch order above. The batch consumes two operational slots without a test
probe and three with one, within the existing pending-command budget.

The shell waits under the unchanged absolute deadline for every dispatched
promise, validates exact method/session/result schemas and consecutive IDs, then
reduces the typed response events in canonical order: identity, optional test,
resume. Native version/Inspector/Runtime events continue to reach XState while
the promises are pending. Promise completion order never selects a transition.
Any command rejection, missing receipt, ID gap/crossing, session mismatch,
identity mismatch or protocol/schema failure enters failed release; the worker
having been resumed cannot convert failure into authority. An optional test
exception/rejection remains an application diagnostic and cannot block resume
or choose a state. Only exact identity proof, optional-test completion when
configured, exact resume receipt and selected-version `running` can complete
bootstrap.

Revision 18 also made the selected-version proof sticky across the entire
batch. In `identity_probing`, `test_probe_deciding`, `test_probing` and
`resuming`, every
current `VERSION_UPDATED` with the exact frozen registration, version, script,
`status='activated'`, frozen-or-absent target and `runningStatus` of `starting`
or `running` is retained idempotently. `running` may refine `starting` once and
cannot regress. An exact duplicate is a no-op. Any registration/version/script/
status/target drift, `stopping`, `stopped`, `redundant`, or a `starting` update
after `running` is terminal. Thus a single native `running` event remains
available whether it arrives before identity reduction, between identity and
optional-test reduction, between optional-test and resume reduction, or after
the resume receipt.

## Revision-18 falsification evidence and revision-19 decision

A real Chrome-for-Testing 149 run against the exact rebuilt production package
falsified revision 18 after it had already proved the complete revision-16
replacement authority. The retained target/session emitted, in order:

1. `Inspector.targetReloadedAfterCrash`;
2. `Runtime.executionContextsCleared`;
3. one fresh `Runtime.executionContextCreated` with the exact full-script origin.

The revision-18 owner then synchronously sent the identity
`Runtime.evaluate` before `Runtime.runIfWaitingForDebugger`. The trace emitted
no `Inspector.workerScriptLoaded`; the identity command remained unresolved for
the full 30-second absolute probe deadline, after which the same replacement
returned to `Inspector.targetCrashed` and `stopped`. The fresh context therefore
proved authority but did not prove that the paused worker could execute an
evaluation.

This is not a deferred JavaScript or WebSocket send. The tracked raw CDP client
calls `socket.send(serialized)` before returning each command promise. Its
17 deterministic tests pass, including immediate observation of multiple sends
and out-of-order response correlation. All revision-18 command bytes were on the
wire without an intervening await. The falsification shows that Chrome processes
commands serially on this retained service-worker session: a first
`Runtime.evaluate` that requires the paused worker prevents the later same-session
resume command from being processed. Queueing resume bytes later cannot break
that protocol-level causal cycle.

Revision 19 retains every revision-16 crash, reload, context-generation,
tombstone, origin and persistent-session guarantee and retains revision-18's
sticky selected-version metadata semantics. It changes only the bootstrap batch
order and its proof reduction. On the guarded transition out of
`replacement_starting`, one synchronous tracked-client effect dispatches bytes
to the exact retained session in this exact order, without awaiting any reply
between sends:

1. exactly one `Runtime.runIfWaitingForDebugger` with `{}`;
2. the fixed identity `Runtime.evaluate` on the frozen fresh
   `uniqueContextId`;
3. the optional explicit test `Runtime.evaluate` on that same context, only when
   frozen `testProbeConfigured` is true.

The resume command ID is a positive safe integer `n`; the identity command ID
is exactly `n + 1`; when configured, the test command ID is exactly `n + 2`.
Without a test probe, both test receipt fields are `null` and no third command
ID is consumed. The batch consumes two operational command slots without the
test probe and three with it, within the existing pending-command budget. No
other producer may issue a selected-session command between these sends. Before
the first send, the actor atomically reserves the complete slot count and the
complete consecutive safe-integer ID range. Insufficient slots or an ID-range
overflow fails before any batch byte is emitted; a synchronous send failure
after that reservation retains the exact sent prefix, enters failed release and
can never retry the bootstrap batch.

The shell waits for every dispatched promise under the unchanged absolute raw
deadline, validates each exact session, method, parameters, positive command ID,
result schema and result hash, and only then emits typed machine events in the
canonical dispatch order: resume, identity, optional test. Promise completion
order never selects a transition. Native version, Inspector and Runtime events
continue to reach the actor while the promise wait is pending. A resume rejection
or malformed receipt means the pause was not released and is terminal. An
identity rejection, exception or mismatch means authority was not proved and is
terminal even though resume succeeded. An optional-test exception or rejected
awaited application result is a blocking application diagnostic but still
completes that operational state; a command/transport/schema failure is
terminal. A missing promise, ID gap/crossing/duplicate, session or method
mismatch, parameter drift, malformed result or deadline expiry enters failed
release and can never publish bootstrap authority.

The selected-version proof remains sticky while the batch is pending and while
its receipts are reduced. In `resuming`, `identity_probing`,
`test_probe_deciding` and `test_probing`, every current `VERSION_UPDATED` with
the exact frozen registration, version, script, `status='activated'`,
frozen-or-absent target and `runningStatus` of `starting` or `running` is
retained idempotently. `running` may refine `starting` once and is sticky. An
exact duplicate is a no-op. Registration/version/script/status/target drift,
`stopping`, `stopped`, `redundant`, or `running -> starting` is terminal in each
state. Thus the one native `running` proof survives whether it arrives before
resume reduction, between resume and identity, between identity and optional
test, or after the final command reduction. Bootstrap completes only after the
exact resume receipt, identity proof, optional-test completion when configured,
selected-version `running` and all batch correlation hashes are retained.

## Revision-19 handoff falsification and revision-20 decision

Four real Chrome-for-Testing 149 runs proved revision 19's raw restart and exact
release. The first canonical `runtime.service-worker-reload` run then failed
before `connectOverCDP`: the controller passed the complete
`RawWorkerAuthority` object to the narrower Playwright owner. TypeScript allowed
that structural superset, while the runtime validator iterated every enumerable
value as a string. The numeric `attachmentGeneration` therefore reached
`String.prototype.includes` and raised `TypeError: value.includes is not a
function`. The handoff had no explicit runtime projection contract.

Revision 20 retains all revision-19 behavior and adds exactly one boundary
contract. After exact raw release and before Playwright acquisition, the
controller constructs a fresh `PlaywrightAuthorityV1` object with exactly these
six own enumerable fields and no spread operation:

```text
PlaywrightAuthorityV1 = {
  extensionId: string,
  registrationId: string,
  versionId: string,
  scopeURL: string,
  scriptURL: string,
  targetId: string
}
```

Every value is copied from the frozen `RawWorkerAuthority` of the current
process/lease/restart epoch. `sessionId`, `uniqueContextId`,
`attachmentGeneration` and `attachmentOrigin` are deliberately excluded: raw
release has revoked that session/context capability, while the Playwright owner
must establish its own nested diagnostic session and context on the same frozen
target. The projection cannot alter state or authorize effects.

The pre-reservation projection boundary schema-validates this DTO. It rejects a
non-record, missing or unknown key, non-string value, empty or over-bound
identifier, NUL/CR/LF, non-canonical extension ID, mismatched scope, script
outside the scope or malformed target identity with a typed harness error. It
then copies the six values into a new deeply frozen object; the Playwright owner never enumerates
or retains a caller-owned structural superset. A validation rejection cannot
reach `connectOverCDP`, expose fixture capabilities or create a pass.

Revision-20 contract tests must prove the exact raw-to-Playwright projection,
reject each missing, extra and non-string field without a JavaScript `TypeError`,
and retain all existing authority URL/scope checks. The canonical packaged
runtime scenario must then pass three consecutive real-Chrome repetitions; a
raw-only smoke cannot satisfy this handoff proof.

Independent review rejected revision 20 because that projection remained an
unmodeled shell precondition and did not decide ownership on rejection.
Revision 21 added a pre-reservation actor step, but independent review rejected
its omitted event DTO, open no-owner receipt, escaping reflection traps and
stale final obligation. Revision 22 closed those boundaries but did not bind a
self-consistent event DTO to its raw source. Revision 23 retains the DTO and
actor step and closes that final authority edge below.

The invoked raw epoch returns `RAW_RELEASE_PROVED` atomically with its exact
private release receipt and the deeply frozen current `RawWorkerAuthority` from
the same actor output. The outer transition retains both in machine context; no
shell reconstruction or later mutable reference may replace them. From
`owner_none`, and only with the current exact raw-release receipt, the outer
machine accepts `PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED` and enters
`playwright_authority_projecting`. This state owns no root transport, reserves no
lease and exposes no capability. Its sole pure invoked effect selects the six
named raw fields into a new object, parses it, freezes it and computes
`authorityProjectionSha256 = SHA-256(JCS(PlaywrightAuthorityV1))`.

The invocation returns exactly one closed event:

```text
PLAYWRIGHT_AUTHORITY_PROJECTED {
  processGeneration, playwrightEpoch, rawReceiptSha256,
  authority: PlaywrightAuthorityV1,
  authorityProjectionSha256
}

PLAYWRIGHT_AUTHORITY_REJECTED {
  processGeneration, playwrightEpoch, rawReceiptSha256,
  error: PlaywrightAuthorityProjectionErrorV1
}

PlaywrightAuthorityProjectionErrorV1 = {
  schemaVersion: 1,
  code:
    | 'SOURCE_NOT_RECORD'
    | 'SOURCE_INTROSPECTION_FAILED'
    | 'KEY_SET_INVALID'
    | 'FIELD_TYPE_INVALID'
    | 'FIELD_EMPTY'
    | 'FIELD_UTF8_LIMIT_EXCEEDED'
    | 'FIELD_CONTROL_CHARACTER'
    | 'EXTENSION_ID_INVALID'
    | 'SCOPE_URL_INVALID'
    | 'SCRIPT_URL_INVALID',
  field: 'extensionId' | 'registrationId' | 'versionId' |
         'scopeURL' | 'scriptURL' | 'targetId' | null
}
```

The exact accepted projection fields use `MAX_ID_BYTES = 4,096`; all six values
must be non-empty strings without NUL, CR or LF. `extensionId` must match
`^[a-p]{32}$`; `scopeURL` must equal
`chrome-extension://<extensionId>/`; `scriptURL` must begin with that exact
scope; `targetId` has no additional syntax beyond the common bounded-ID rules.
The parser uses `Reflect.ownKeys` and own data descriptors inside one closed
inspection boundary: symbols, accessors, non-enumerable fields and a key set
other than the exact six are `KEY_SET_INVALID`. Any thrown `ownKeys`,
`getOwnPropertyDescriptor`, prototype or property-read trap, including a revoked
Proxy, is caught before it crosses the boundary and normalized to
`SOURCE_INTROSPECTION_FAILED` with `field:null`. It reads no accessor and never
exposes a native reflection error or `TypeError`.

`PLAYWRIGHT_AUTHORITY_PROJECTED` with exact generation, epoch, current raw
receipt hash, a schema-valid six-field DTO and a hash recomputed from that exact
event DTO enters `playwright_authority_ready` only when all six DTO values equal
the pure canonical projection of `context.currentRawAuthority` and
`event.authorityProjectionSha256 ===
SHA-256(JCS(project(context.currentRawAuthority)))`. The transition action copies and
deeply freezes `event.authority` into private machine context; no invoked-actor
or shell side channel can populate it. That state still owns no transport.
`PLAYWRIGHT_RESERVE_REQUESTED` is admissible only there and must repeat the exact
projection hash; only its transition reserves the next lease and opens the
tracked transport. `PLAYWRIGHT_AUTHORITY_REJECTED` enters outer
`failed_shutdown_connecting` directly. Its transition action freezes this
private receipt before any shutdown effect runs:

```text
NoOwnerReleaseReceiptV1 = {
  schemaVersion: 1,
  processGeneration,
  playwrightEpoch,
  rawReceiptSha256,
  ownerKind: 'none',
  leaseReserved: false,
  transportOpened: false,
  authorityProjectionSha256: null,
  receiptSha256
}
```

`receiptSha256` is SHA-256 over RFC 8785 JCS of the preceding eight fields,
excluding itself. The transition guard requires the current generation, pending
Playwright epoch and exact current raw receipt hash; the state itself proves no
lease counter was incremented and no transport identity exists. There is no
`OWNER_RELEASE_PROVED` event in this branch because there is no owner to release.
Failed shutdown/profile removal proceeds from the frozen no-owner receipt.
Stale, duplicate, malformed or hash-divergent projection events cannot reserve
a lease, connect or fabricate this receipt.

The controller passes only the privately retained, parsed and frozen DTO to the
Playwright owner. The owner accepts that branded value; it never accepts or
enumerates the raw structural superset. Thus no post-reservation authority
validation rejection exists in the canonical path. A direct boundary parser
test may supply hostile `unknown` values, but `connectOverCDP`, `transport.open`
and every fixture effect must remain uncalled on rejection.

This pending revision's hostile tests cover every error code and field, non-record inputs,
each missing/extra/symbol/accessor/non-enumerable key case, every non-string,
empty, 4,097-byte and NUL/CR/LF value, non-canonical extension ID, scope/script
drift, throwing `ownKeys`/descriptor/property traps, a revoked Proxy, and exact
exclusion of `sessionId`, `uniqueContextId`,
`attachmentGeneration` and `attachmentOrigin`. Machine tests prove success,
rejection, stale generation/epoch/raw receipt, duplicate result and projection
hash drift. They also mutate each of the six authority fields independently,
recompute a self-consistent event hash and retain the correct raw receipt; every
such foreign DTO must leave the machine outside `playwright_authority_ready`
with zero reservation and zero transport. Controller tests prove zero lease, zero transport and zero
`connectOverCDP` before acceptance. The canonical runtime scenario must still
pass three consecutive real-Chrome repetitions against this pending revision.

## Authoritative XState topology

Implementation uses two private XState v5 machines:

- `mv3HarnessMachine` owns artifact, process, exclusive CDP lease, Playwright
  epochs, verdict and global cleanup;
- an invoked `rawWorkerRestartMachine` owns one raw epoch from auto-attach arm
  through exact release.

The shell performs process, file, WebSocket, CDP and Playwright I/O only as
invoked actors. Actor results are schema-validated typed events. No `phase`,
boolean ownership flag, free-text status, promise arrival order, diagnostic text
or LLM output may decide a transition. XState state nodes are the sole phase and
ownership authority.

The public fixture receives detached frozen DTOs and one narrowly typed facade
whose only operations are `openSidePanel`, `seedStorage`,
`restartServiceWorkerForProbe`, `evaluateInRestartedServiceWorker` and
read-only diagnostic/manifest access. It never receives an XState actor, native
snapshot, Browser, BrowserContext, Worker, CDPSession, private capability,
endpoint or mutable receipt. `Page` is returned only by `openSidePanel` for the
current Playwright epoch and is invalidated by a restart.

### Outer machine

The lifecycle region has these explicit transitions; every state entry invokes
only the effect named in the final column:

| State                                                      | Event / guard                                                       | Next state                         | Effect                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `absent`                                                   | `HARNESS_STARTED`                                                   | `artifact_sealing`                 | inspect and hash exact `dist`                                             |
| `artifact_sealing`                                         | `ARTIFACT_SEALED`                                                   | `profile_creating`                 | create fresh profile after proving no endpoint file                       |
| `profile_creating`                                         | `PROFILE_CREATED`                                                   | `process_spawning`                 | spawn exact child once                                                    |
| `process_spawning`                                         | `PROCESS_SPAWNED`                                                   | `endpoint_waiting`                 | wait for strict file parse while racing child exit                        |
| `endpoint_waiting`                                         | `ENDPOINT_PARSED`                                                   | `owner_none`                       | retain private parsed capability; open no socket                          |
| `owner_none`                                               | `RAW_ACQUIRE_REQUESTED(initial_bootstrap)` and no reservation       | `raw_connecting.initial_bootstrap` | reserve epoch, then open tracked raw socket                               |
| `raw_connecting.initial_bootstrap`                         | current `RAW_TRANSPORT_OPENED`                                      | `raw_connecting.initial_bootstrap` | retain exact transport ID; send `Browser.getVersion`                      |
| `raw_connecting.initial_bootstrap`                         | current `ENDPOINT_VERIFIED`                                         | `raw_owned.initial_bootstrap`      | invoke raw restart actor                                                  |
| `raw_owned.initial_bootstrap`                              | `RAW_BOOTSTRAP_PROVED`                                              | `raw_releasing.initial_bootstrap`  | invoke exact raw release                                                  |
| `raw_releasing.initial_bootstrap`                          | `RAW_RELEASE_PROVED` from current invoked raw actor                 | `owner_none`                       | atomically retain private raw receipt and frozen `RawWorkerAuthority`     |
| `owner_none`                                               | `PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED` and current raw receipt | `playwright_authority_projecting`  | invoke pure six-field projection; own no lease or transport               |
| `playwright_authority_projecting`                          | current exact `PLAYWRIGHT_AUTHORITY_PROJECTED`                      | `playwright_authority_ready`       | retain frozen DTO and projection hash privately                           |
| `playwright_authority_projecting`                          | current exact `PLAYWRIGHT_AUTHORITY_REJECTED`                       | `failed_shutdown_connecting`       | freeze typed error and exact no-owner receipt; open no owner cleanup      |
| `playwright_authority_ready`                               | `PLAYWRIGHT_RESERVE_REQUESTED` with exact projection hash           | `playwright_connecting`            | reserve epoch, open tracked public transport, connect                     |
| `playwright_connecting`                                    | current `PLAYWRIGHT_TRANSPORT_OPENED`                               | `playwright_connecting`            | retain transport ID; call `connectOverCDP` once                           |
| `playwright_connecting`                                    | `PLAYWRIGHT_HANDOFF_PROVED`                                         | `playwright_owned.exercising`      | expose detached fixture facade                                            |
| `playwright_connecting`                                    | `PLAYWRIGHT_CONNECT_FAILED_CLOSED`                                  | `failed_releasing`                 | retain closed failed-connect receipt                                      |
| `playwright_owned.exercising`                              | `RESTART_REQUESTED` and runtime restart count is `0`                | `playwright_releasing.restart`     | atomically reserve count `1`; close fixture pages; disconnect             |
| `playwright_owned.exercising`                              | `RESTART_REQUESTED` and runtime restart count is `1`                | `failed_releasing`                 | retain restart-limit violation; release current owner                     |
| `playwright_releasing.restart`                             | `PLAYWRIGHT_RELEASE_PROVED`                                         | `owner_none`                       | invalidate every old Playwright handle                                    |
| `owner_none`                                               | `RAW_ACQUIRE_REQUESTED(runtime_restart)` and restart pending        | `raw_connecting.runtime_restart`   | reserve higher epoch, then open tracked raw socket                        |
| `raw_connecting.runtime_restart`                           | current `RAW_TRANSPORT_OPENED`                                      | `raw_connecting.runtime_restart`   | retain exact transport ID; send `Browser.getVersion`                      |
| `raw_connecting.runtime_restart`                           | current matching `ENDPOINT_VERIFIED`                                | `raw_owned.runtime_restart`        | invoke same-process raw restart actor                                     |
| `raw_owned.runtime_restart`                                | `RAW_BOOTSTRAP_PROVED`                                              | `raw_releasing.runtime_restart`    | invoke exact raw release                                                  |
| `raw_releasing.runtime_restart`                            | `RAW_RELEASE_PROVED` from current invoked raw actor                 | `owner_none`                       | atomically retain private restart receipt and frozen `RawWorkerAuthority` |
| `playwright_owned.exercising`                              | `USE_COMPLETED`                                                     | `diagnostics_settling`             | settle late diagnostics for the fixed interval                            |
| `diagnostics_settling`                                     | `DIAGNOSTICS_ACCEPTED` and verdict `eligible`                       | `artifact_reverifying`             | recompute exact tree digest                                               |
| `diagnostics_settling`                                     | `DIAGNOSTICS_REJECTED` or verdict `blocked`                         | `failed_releasing`                 | retain rejected diagnostic ledger                                         |
| `artifact_reverifying`                                     | late diagnostic or evidence overflow                                | `failed_releasing`                 | retain blocked verdict; release Playwright owner                          |
| `artifact_reverifying`                                     | `ARTIFACT_MATCHED` and verdict `eligible`                           | `playwright_releasing.final`       | close fixture pages except sentinel; disconnect                           |
| `playwright_releasing.final`                               | `PLAYWRIGHT_RELEASE_PROVED` and verdict `eligible`                  | `shutdown_connecting`              | reserve shutdown epoch; open tracked raw socket                           |
| `playwright_releasing.final`                               | `PLAYWRIGHT_RELEASE_PROVED` and verdict `blocked`                   | `failed_shutdown_connecting`       | preserve release proof; perform failure shutdown only                     |
| `shutdown_connecting`                                      | current `SHUTDOWN_TRANSPORT_OPENED`                                 | `shutdown_connecting`              | retain transport ID; send `Browser.getVersion`                            |
| `shutdown_connecting`                                      | current matching `SHUTDOWN_ENDPOINT_VERIFIED`                       | `shutdown_owned`                   | send exact `Browser.close`                                                |
| `shutdown_owned`                                           | current close response or causal socket-close receipt               | `shutdown_owned`                   | retain the exact close proof                                              |
| `shutdown_owned`                                           | current exact `PROCESS_EXITED` and one retained close proof         | `profile_removing`                 | remove profile after causal shutdown proof                                |
| `shutdown_owned`                                           | current exact `PROCESS_EXITED` without a retained close proof       | `failed_profile_removing`          | retain non-causal exit failure; remove profile; never pass                |
| `profile_removing`                                         | late blocking diagnostic, protocol failure or evidence overflow     | `profile_removing`                 | revoke eligibility; continue bounded profile removal                      |
| `profile_removing`                                         | `PROFILE_REMOVED` and every pass invariant and verdict `eligible`   | `passed`                           | freeze pass evidence                                                      |
| `profile_removing`                                         | `PROFILE_REMOVED` and verdict `blocked`                             | `archived`                         | archive failed evidence; never enter passed                               |
| `passed`                                                   | late blocking diagnostic, protocol failure or evidence overflow     | `passed_blocked`                   | revoke provisional pass; retain late evidence                             |
| `passed`                                                   | `VERDICT_ARCHIVED` and verdict `eligible`                           | `archived`                         | atomically archive pass evidence                                          |
| `passed_blocked`                                           | `VERDICT_ARCHIVED`                                                  | `archived`                         | archive failed evidence; never archive a pass                             |
| any live operational state except shutdown/profile removal | current unexpected `PROCESS_EXITED`                                 | `failed_process_exited_releasing`  | retain original failure; close local owner/listeners only                 |
| `failed_process_exited_releasing`                          | current `EXITED_OWNER_CLOSED`                                       | `failed_profile_removing`          | remove exact exited profile; never reconnect or signal PID                |

Every guard/effect/protocol/identity failure transitions the lifecycle region to
`failed_releasing`, except the explicitly pre-reservation authority-projection
rejection, which freezes `NoOwnerReleaseReceiptV1` and enters
`failed_shutdown_connecting` directly. `failed_releasing` invokes the
owner-specific release. It accepts
`OWNER_RELEASE_PROVED` only after either a complete normal release or an exact
no-owner receipt, then enters `failed_shutdown_connecting`. If an exact current
`PROCESS_EXITED` receipt already exists, `failed_releasing` first closes any
remaining local transport object without opening a socket or signalling the dead
PID, then transitions directly to `failed_profile_removing`. Otherwise exact
shutdown transport acquisition enters `failed_shutdown`; exact child exit enters
`failed_profile_removing`; `PROFILE_REMOVED` enters `archived`. `CLEANUP_FAILED`
retains the failed lifecycle and evidence and can never reach `passed`.

The parallel verdict region has only:

```text
eligible -- APPLICATION_DIAGNOSTIC_RECORDED | EVIDENCE_OVERFLOW_RECORDED |
            OBSERVER_PROTOCOL_FAILED --> blocked
blocked -- any later event --> blocked
```

The outer actor is parallel: the lifecycle region follows the operational path
above while the verdict region is exactly `eligible | blocked`. Before diagnostic
settlement, application diagnostics do not interrupt raw resume/release or the
Playwright handoff needed to inspect evidence. `DIAGNOSTICS_ACCEPTED` may advance
toward pass only while the verdict is `eligible`; any later diagnostic routes the
remaining lifecycle through owner release and archived failure, with the guarded
final-release/profile-removal branches above.

`archived` is the sole final state. `passed` is unreachable until all root
transports are closed, the exact child process has exited and the fresh profile
has been removed. A failed verdict never becomes passed; cleanup only makes the
failed verdict archivable.

### Closed events

The outer machine admits only schema-validated events carrying the current
`processGeneration` and, where applicable, `leaseEpoch`:

```text
HARNESS_STARTED
ARTIFACT_SEALED
PROFILE_CREATED
PROCESS_SPAWNED
ENDPOINT_PARSED
ENDPOINT_VERIFIED
RAW_ACQUIRE_REQUESTED | RAW_TRANSPORT_OPENED | RAW_ACQUIRE_REJECTED
RAW_BOOTSTRAP_PROVED | RAW_RELEASE_PROVED | RAW_FAILED
PLAYWRIGHT_AUTHORITY_PROJECTION_REQUESTED
PLAYWRIGHT_AUTHORITY_PROJECTED | PLAYWRIGHT_AUTHORITY_REJECTED
PLAYWRIGHT_RESERVE_REQUESTED
PLAYWRIGHT_TRANSPORT_OPENED | PLAYWRIGHT_HANDOFF_PROVED
PLAYWRIGHT_RELEASE_PROVED | PLAYWRIGHT_CONNECT_FAILED_CLOSED | PLAYWRIGHT_FAILED
RESTART_REQUESTED
USE_COMPLETED | USE_FAILED
APPLICATION_DIAGNOSTIC_RECORDED | EVIDENCE_OVERFLOW_RECORDED
OBSERVER_PROTOCOL_FAILED
DIAGNOSTICS_ACCEPTED | DIAGNOSTICS_REJECTED
ARTIFACT_MATCHED | ARTIFACT_CHANGED
SHUTDOWN_TRANSPORT_OPENED | SHUTDOWN_ENDPOINT_VERIFIED
SHUTDOWN_BROWSER_CLOSE_RESOLVED | SHUTDOWN_SOCKET_CLOSED_AFTER_COMMAND
OWNER_RELEASE_PROVED | PROCESS_EXITED | PROFILE_REMOVED
EXITED_OWNER_CLOSED
VERDICT_ARCHIVED | CLEANUP_FAILED
```

Unknown or malformed events are rejected by the schema boundary before XState.
Well-formed stale-generation, stale-epoch and duplicate terminal events enter the
machine and are rejected or ignored by explicit named guards. They are retained
as diagnostics but cannot mutate a newer state.

## Sealed artifact and diagnostics

The tree digest is SHA-256 over sorted relative POSIX path, byte length and
per-file SHA-256, including `manifest.json`. Pre-launch and post-use digests must
match. Packaged bytes identifying `src/dev`, Chrome stubs, DevPanel, bridge
logger, DEV globals or DEV storage keys are terminal failure.

Blocking diagnostics include every page `pageerror`, page `console.error`,
failure-vocabulary warning, service-worker error/failure warning, raw or
Playwright `Runtime.exceptionThrown`, unhandled rejection, unexpected process
exit and matching late-settlement record. The fixture owns one epoch-keyed
bounded evidence accumulator across every raw and Playwright epoch and exposes
frozen copies only.

Every inbound CDP message is rejected above `MAX_CDP_MESSAGE_BYTES = 1_048_576`.
Every schema-valid evidence item has a canonical JCS form capped at 65,536 bytes.
Diagnostic, protocol-command and nested-CDP accumulators each retain at most
4,096 items and 4 MiB.

Authority maps never retain raw CDP `params`, descriptions, stack traces or
remote-object payloads. Their schemas normalize only bounded IDs, URL identity,
enums, booleans, safe integers and event hashes. Every retained string is first
bounded by UTF-8 bytes: IDs at 512 bytes and canonical URLs at 4,096 bytes. The
canonical JCS byte length is checked before a map or inventory mutation. The
closed per-structure budgets are:

| Structure             | Entries | JCS bytes per entry | JCS bytes total |
| --------------------- | ------: | ------------------: | --------------: |
| registration map      |      64 |               4,096 |         262,144 |
| version map           |     256 |               4,096 |       1,048,576 |
| target map            |   1,024 |               4,096 |       4,194,304 |
| session map           |   1,024 |               4,096 |       4,194,304 |
| execution-context map |   4,096 |               2,048 |       8,388,608 |
| attachment inventory  |   1,024 |               8,192 |       8,388,608 |

Active context records, crash-time revoked-context tombstones and post-crash
destroyed-context tombstones share the single execution-context budget above.
The crash transition changes pre-crash authority classification atomically
without duplicating retained payloads. A post-crash destroy retains only its
normalized unique ID in the separate tombstone set, never the raw CDP payload.
The per-restart `retiredContextEvidenceCount` has a hard cap of 4,096 for
destroy/clear observations; event 4,097 records typed overflow and enters failed
release. Later context events therefore cannot create an unbounded second
history even when IDs repeat.

The listener registry is capped at 64 normalized entries and 65,536 total JCS
bytes. Pending commands have a hard total cap of 256 split into 224 operational
slots and 32 cleanup-only reserved slots; their normalized metadata is capped at
2,048 bytes per entry and 524,288 bytes total. Operational code cannot consume
the reserve; after overflow, cleanup commands are strictly serialized and reuse
at most one reserved slot at a time. Each accumulator and bounded structure
maintains an O(1) hash chain
`H_n=SHA-256(H_(n-1)||u64(length)||SHA-256(item))`, total count/bytes, retained
count/bytes and overflow count without retaining overflow payloads.

The first cap breach emits typed `EVIDENCE_OVERFLOW_RECORDED`, moves the verdict
to `blocked`, replaces further rendered records with metadata-only counters and
continues mandatory release. Any authority-map, attachment-inventory or pending
operational-command overflow enters `failed_releasing`, stops mutating that
bounded map, disarms auto-attach using the reserved cleanup slot and can prove
only failed shutdown, never a complete normal raw release. A pass requires zero
overflow in every accumulator/map, so its retained evidence is complete.
Flooding can therefore make the gate red but cannot grow memory without bound or
consume the cleanup command capacity.

Every raw replacement session installs `Runtime.enable`, console, exception and
execution-context observers before any fixed probe and before
`Runtime.runIfWaitingForDebugger`. Probe source is an explicit test input, never
a transition signal. Probe success cannot authorize bootstrap. A console warning,
rejection or exception produced by application/probe code emits the typed
`APPLICATION_DIAGNOSTIC_RECORDED` event, appends the ledger and moves the
parallel verdict region to `blocked`, but the raw machine continues through
resume, exact release and handoff so adversarial tests can inspect the evidence.
`DIAGNOSTICS_REJECTED` later makes pass impossible. A fixed identity response
with wrong values or `exceptionDetails` also emits `IDENTITY_PROOF_FAILED` and
enters release because authority was not proved; an optional test-probe
exception remains diagnostic-only. Failure to install an
observer, parse a protocol event, transport the probe command, correlate identity
or preserve ownership emits `OBSERVER_PROTOCOL_FAILED` and interrupts
immediately. A probe expression that returns `exceptionDetails` or rejects is an
application diagnostic; a CDP command/transport/schema failure is an observer
protocol failure. Diagnostic text never selects either category; the emitting
typed channel does.

## Manually owned Chromium process

Playwright may resolve `chromium.executablePath()` before launch, but no
Playwright browser-launch or connection API may run before the first raw proof.
The process actor uses `node:child_process.spawn` with `shell:false`, the exact
bundled Chrome for Testing executable, and an audited immutable argument
allowlist for the pinned Playwright/Chromium version. It never imports private
`playwright-core/lib` modules.

The common ordered allowlist is exact; `<profile>` and `<dist>` are absolute
validated paths and every other byte is literal:

```text
--disable-field-trial-config
--disable-background-networking
--disable-background-timer-throttling
--disable-backgrounding-occluded-windows
--disable-back-forward-cache
--disable-breakpad
--disable-client-side-phishing-detection
--disable-component-extensions-with-background-pages
--disable-component-update
--no-default-browser-check
--disable-default-apps
--disable-dev-shm-usage
--disable-edgeupdater
--disable-extensions
--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion
--enable-features=CDPScreenshotNewSurface
--allow-pre-commit-input
--disable-hang-monitor
--disable-ipc-flooding-protection
--disable-popup-blocking
--disable-prompt-on-repost
--disable-renderer-backgrounding
--force-color-profile=srgb
--metrics-recording-only
--no-first-run
--password-store=basic
--use-mock-keychain
--no-service-autorun
--export-tagged-pdf
--disable-search-engine-choice-screen
--unsafely-disable-devtools-self-xss-warnings
--edge-skip-compat-layer-relaunch
--disable-infobars
--disable-sync
--enable-unsafe-swiftshader
--no-sandbox
--remote-debugging-address=127.0.0.1
--remote-debugging-port=0
--user-data-dir=<profile>
--disable-extensions-except=<dist>
--load-extension=<dist>
--window-size=420,900
```

Headless mode then appends exactly:

```text
--headless
--hide-scrollbars
--mute-audio
--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4
```

Headed mode appends none of those four. Both reviewed modes append one final
positional `about:blank` and no other argument. The implementation verifies the
pinned `@playwright/test` version `1.61.1` and refuses a version drift before
spawn; a future upgrade must review this allowlist.

Chromium admission is closed as well. Before spawn, the resolved
`playwright-core/package.json` must be version `1.61.1`; its own
`browsers.json` must contain exactly the installed `chromium` tuple
`{revision:"1228",browserVersion:"149.0.7827.55",title:"Chrome for Testing"}`.
`chromium.executablePath()` must resolve to a regular non-symlink executable
under that revision's Playwright cache directory, its SHA-256 is frozen, and an
argument-only `--version` preflight must trim to exactly
`Google Chrome for Testing 149.0.7827.55`. The launched child later admits only
`Browser.getVersion` with `protocolVersion:"1.3"`,
`product:"Chrome/149.0.7827.55"`,
`revision:"@3188f8a607ae7e067593be8aab7f02d2451fec07"` and
`jsVersion:"14.9.207.21"`. Platform-specific user-agent bytes are frozen but do
not weaken those exact fields. Any package, metadata, realpath, mode, preflight
or CDP-version drift is terminal before extension authority.

The allowlist therefore includes exactly one value for each launch capability:

- fresh `--user-data-dir=<profile>`;
- `--remote-debugging-address=127.0.0.1` and
  `--remote-debugging-port=0`;
- `--disable-extensions-except=<sealed dist>` and
  `--load-extension=<sealed dist>`;
- deterministic headless/window flags or their reviewed headed equivalent;
- the audited Playwright stability flags, `--no-sandbox` for the test runner,
  `--no-default-browser-check`, `--no-first-run`, then one final `about:blank`.

There is no user-provided passthrough, shell expansion, default user profile,
remote host binding, Vite server, backend or unsealed extension path. The spawn
receipt freezes:

```text
(processGeneration, pid, executablePath, executableSha256,
 browserRevision, browserVersion, argvSha256,
 userDataDir, sealedTreeSha256, spawnedAt)
```

Stdout/stderr are drained through a streaming UTF-8 line decoder with a
16-KiB line cap and a 1-MiB total cap per stream. Raw process bytes never enter
logs, errors, ledgers or attachments. Before retention, a structurally parsed
line matching Chrome's `DevTools listening on ws://127.0.0.1:<port><path>` form
is replaced in full by
`[redacted-devtools-endpoint processGeneration=<n>]`; the port and browser path
are never retained. Any other line containing a `ws://`/`wss://` endpoint is
redacted in full and blocks the verdict. Invalid UTF-8 and overlong lines are
replaced by bounded metadata-only records, never truncated raw content. `error`
and `exit` race every startup, endpoint, raw, Playwright and cleanup wait.

### `DevToolsActivePort` capability

The file must not exist before spawn. Admission requires, under one startup
deadline:

1. `lstat` proves a regular non-symlink file inside the exact fresh profile;
2. bytes match exactly `<port>\n<browser-path>` with one optional final `\n`, no
   CR, and no third record;
3. record one is a canonical decimal loopback port in `1..65535`;
4. record two matches the complete lowercase canonical UUID form
   `^/devtools/browser/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`;
5. the derived endpoint is exactly
   `ws://127.0.0.1:<port><browser-path>`.

This parsing emits `ENDPOINT_PARSED`; it opens no socket and does not claim that
the endpoint belongs to the child. The endpoint becomes verified only after the
machine reserves a raw lease, enters `raw_connecting`, opens its sole tracked
socket, and receives `Browser.getVersion` before child exit. That response
validates the pinned fields above and freezes `(protocolVersion, product,
revision, userAgent, jsVersion, browserVersionResponseSha256)` into the
process/endpoint receipt used at every handoff.

The parsed endpoint is a private capability bound to the process generation. It
is never attached to test evidence, fixture DTOs, logs or errors. A stale file,
wrong generation, symlink, malformed port/path, timeout, connection failure,
version failure or child exit is terminal.

## Exclusive CDP lease

`CdpLease` is a private capability with closed XState ownership states:

```text
owner_none
raw_connecting(processGeneration, leaseEpoch, transportId, purpose)
raw_owned(processGeneration, leaseEpoch, transportId, purpose)
playwright_connecting(processGeneration, leaseEpoch)
playwright_owned(processGeneration, leaseEpoch, browserId)
shutdown_connecting(processGeneration, leaseEpoch, transportId)
shutdown_owned(processGeneration, leaseEpoch, transportId)
```

`purpose` is only `initial_bootstrap` or `runtime_restart`. The machine reserves
the next lease epoch before opening a transport. The endpoint opener is private
to the lease actor, so harness code cannot create a second root socket.

For the isolated test runner, these invariants are mandatory:

```text
rootLeaseReservations in {0, 1}
openHarnessRootTransports <= 1
openHarnessRootTransports <= rootLeaseReservations
owner_none => reservation == 0 and open == 0
raw_owned/playwright_owned/shutdown_owned => reservation == 1 and open == 1
raw_connecting/playwright_connecting/shutdown_connecting
  => reservation == 1 and open in {0, 1}
raw and Playwright ownership are mutually exclusive
```

Before every raw arm, a fresh exact `Target.getTargets` response must show no
service-worker target with `attached:true`. Before raw acquisition after
Playwright, the exact `browser.close()` promise, Playwright `disconnected` event
and transport-close receipt must all exist. Before Playwright connection, the
complete raw-release receipt must exist. No local boolean or missing event is a
release proof.

The initial raw lease is reserved only after `ENDPOINT_PARSED`. Its
`raw_connecting` actor opens the sole tracked socket and sends
`Browser.getVersion`; only the exact current response emits `ENDPOINT_VERIFIED`
and enters `raw_owned`. A connection or version failure must close the tracked
socket and produce a close receipt before `owner_none`, failure shutdown or any
new acquisition.

### Deadline constants

All time budgets use monotonic time and are configuration constants, not caller
inputs:

```text
ARTIFACT_IO_TIMEOUT_MS = 5_000
PROFILE_CREATE_TIMEOUT_MS = 5_000
PROCESS_STARTUP_TIMEOUT_MS = 15_000
RAW_OPERATION_TIMEOUT_MS = 20_000
RAW_RELEASE_TIMEOUT_MS = 5_000
PLAYWRIGHT_HANDOFF_TIMEOUT_MS = 15_000
PLAYWRIGHT_RELEASE_TIMEOUT_MS = 5_000
TEST_EFFECT_TIMEOUT_MS = 60_000
DIAGNOSTIC_SETTLE_MS = 100
SHUTDOWN_TIMEOUT_MS = 10_000
TERM_GRACE_MS = 2_000
KILL_GRACE_MS = 2_000
PROFILE_REMOVE_TIMEOUT_MS = 5_000
FAILURE_OWNER_RELEASE_TIMEOUT_MS = 5_000
MAX_RUNTIME_RESTARTS = 1
HARNESS_GLOBAL_DEADLINE_MS = 210_000
MV3_TEST_TIMEOUT_MS = 240_000
```

One absolute operation deadline is created before each phase and never reset
within it. A separate release/cleanup deadline may free resources after an
operation timeout, but can never convert that failed operation into success.
Exactly one runtime restart may be requested and all test effects share the one
`TEST_EFFECT_TIMEOUT_MS` budget. The closed worst-case sum for two artifact
reads, profile creation, process startup, two raw operations/releases, two
Playwright handoffs/releases, test effects, diagnostic settlement, one failure
owner release, shutdown including TERM/KILL, and profile removal is 204,100 ms.
The controller's 210,000-ms monotonic global deadline includes that work and
refuses to start a phase unless its full bound plus remaining mandatory cleanup
fits. The Playwright config and every test must use exactly the larger
`MV3_TEST_TIMEOUT_MS`; its 30,000-ms margin prevents the framework timeout from
preempting bounded cleanup.

The loopback endpoint cannot cryptographically exclude a hostile local process.
The absolute guarantee covers clients created by this harness in its isolated CI
runner. A threat model containing a hostile same-host process requires a separate
review for `--remote-debugging-pipe`; it is outside revision 13.

## Raw control plane

One raw WebSocket multiplexes every command. Root Target events are subscribed
synchronously before the first command. The raw owner then:

1. freezes the one launch sentinel as the only complete `type:"page"`,
   `url:"about:blank"` target from an exact explicit page-only
   `Target.getTargets` response; the same `sentinelTargetId` survives every lease
   epoch;
2. proves with an exact service-worker-only `Target.getTargets` response that no
   worker target is already attached before this raw epoch arms auto-attach;
3. acknowledges exact service-worker-only `Target.setDiscoverTargets`;
4. acknowledges browser-root `Target.setAutoAttach` before any stop/start;
5. attaches to the frozen sentinel with `flatten:true` and acknowledges
   `ServiceWorker.enable` on that child control session;
6. converges installation metadata and obtains one exact selected worker
   session;
7. keeps that selected session attached across controlled stop/start, proves the
   native crash/reload lifecycle, resumes the paused replacement and then probes
   it through the same synchronously dispatched batch;
8. releases every raw authority before Playwright may connect.

The sentinel is created only by the final launch argument, never by a CDP
command. It is not exposed through the fixture, is never used for product
assertions and remains open until global browser shutdown. Playwright release
closes every fixture-created page but preserves this exact sentinel so Chromium
cannot disappear between lease epochs.

The page-only sentinel query is sent without `sessionId` and exactly:

```json
{
  "filter": [{ "type": "page", "exclude": false }, { "exclude": true }]
}
```

No implementation-side post-filter may turn multiple/malformed targets into a
unique sentinel. Discovery uses the exact same sequential service-worker filter
as the pre-arm fence and arm command. A pre-arm response containing any
`type:"service_worker"` target with `attached:true` is terminal before discovery
or auto-attach. The arm is sent without `sessionId` and exactly:

```json
{
  "autoAttach": true,
  "waitForDebuggerOnStart": true,
  "flatten": true,
  "filter": [{ "type": "service_worker", "exclude": false }, { "exclude": true }]
}
```

Revision 13 never calls `Target.autoAttachRelated`. A rejected/mutated arm,
socket loss or any start before its successful current-command response is
terminal.

## Installation convergence and warm authority

The manifest's exact background service-worker path is known before launch. The
extension ID is derived only from a complete `chrome-extension:` worker target or
version URL with that exact path. The root scope is then exactly
`chrome-extension://<extensionId>/`.

`ServiceWorker.workerRegistrationUpdated` and
`ServiceWorker.workerVersionUpdated` are partial updates. The observer maintains
the latest complete member by identity; it never treats one event array as a
complete snapshot. Installation/update transitions and overlapping related
versions are non-terminal until the one deadline expires. Convergence requires:

1. exactly one non-deleted registration has the exact root scope;
2. exactly one related version is non-`redundant`, with exact script URL and
   `status:activated`; every other related version is `redundant`;
3. a fresh exact-filter `Target.getTargets` round-trip completes and conditions
   1-2 still hold;
4. every older related session is classified, observed and resumed if paused;
   no older related session remains live when authority freezes;
5. every foreign/colliding live attachment is absent.

The round-trip is the convergence fence; no sleep authorizes freeze. A candidate
that becomes redundant before the fence is discarded. Deletion, duplicate root
registration, scope/script collision, malformed metadata or non-convergence is
terminal.

Every related attachment enters an append-only inventory. Before any resume,
the raw owner enables `Inspector` and `Runtime`, installs schema-validated
`Inspector.targetCrashed`, `Inspector.targetReloadedAfterCrash`,
`Runtime.exceptionThrown`, `Runtime.consoleAPICalled` and context observers, and
waits for the correlated command replies. Older related sessions are resumed if
paused and must detach after becoming redundant. No older session may satisfy a
later restart proof.

Authority freeze captures:

```text
(processGeneration, leaseEpoch, restartGeneration,
 registrationId, versionId, scopeURL, scriptURL,
 targetId?, sessionId?, attachmentGeneration?)
```

The machine must next establish **warm authority**: the selected activated
version is `running`, has exactly one observed current raw session, all observer
enables are acknowledged, and that session is not waiting for a prior debugger
resume. If the selected version is already `running` or `starting` and has an
exact auto-attached session, that session is used; a paused `starting` session is
observed and resumed, then must become `running`. If an activated `running` or
`starting` version exposes a live target ID but has no raw session, the raw owner
uses the exact target fence and, if still necessary, one manual attachment. That
no-session branch performs no warm-up start. Only an activated `stopped` version,
whether or not its retained DevTools target/session is already visible, receives
one `ServiceWorker.startWorker({scopeURL})` as a warm-up. After its successful
response and an activated `starting` or `running` version update exposes the
exact target ID, an exact filtered `Target.getTargets` fence freezes its sole target.
The `starting` branch is necessary because root auto-attach may already have
paused the warm-up before it can report `running`. If root auto-attach supplied
one exact session, that session is used; otherwise the raw owner sends one explicit
`Target.attachToTarget({targetId,flatten:true})`, retains the correlated manual
session response and installs the same observers. While that command is pending,
at most one provisional selected `TARGET_ATTACHED` event may be retained; it is
classified as the manual session only when the response returns the same session
ID. A different or second selected attachment proves an auto/manual race and is
terminal. The warm-up is resumed if necessary
and can never be reported as bootstrap proof. `warm_authority_ready` is
unreachable until Inspector/Runtime enable replies exist, every issued warm-up
start has its successful `WARMUP_START_RESOLVED`, and every issued warm-up resume
has its successful `WARMUP_RESUME_RESOLVED`, together with the selected running
version and one exact session.

For revision 13, the selected session's acknowledged `Runtime.enable` response
is also an ordering barrier for every earlier context event on the raw socket.
The sequential reducer keeps every later pre-crash context identity in the same
bounded generation ledger through `controlled_stop`; the exact crash transition
then revokes that complete generation and clears its active subset atomically.
The pre-crash ledger is diagnostic authority, not an additional stop
acknowledgement.

Each inventory member records `attachmentOrigin:auto|manual`; origin is immutable
and controls its release proof. After warm authority, deletion, redundancy,
target/session replacement,
scope/script mutation, crossed identity or selected `TARGET_DETACHED` before
entry into `release_resuming` is terminal. The selected session is intentionally
retained through the controlled stop and final same-version start.

## Raw same-version restart machine

Chromium retains one `ServiceWorkerDevToolsAgentHost` for the same browser
context and version. On stop it keeps attached DevTools sessions and emits
`Inspector.targetCrashed`; on restart it reuses those sessions, sets pause on
start because the host is attached, and emits
`Inspector.targetReloadedAfterCrash`. Revision 13 uses the exact crash event as
an atomic context-generation boundary and the reload event as the prerequisite
for a fresh replacement context. It never requires or permits a new selected
`Target.attachedToTarget` between stop and start.

One absolute `rawOperationDeadline` begins before discovery/metadata admission
and bounds arm, convergence, optional warm-up, stop, start, correlation, probes
and resume. Awaited phases do not reset it. Normal exact release consumes one
separate `RAW_RELEASE_TIMEOUT_MS` deadline.

The raw machine admits only these schema-validated events with current process,
lease, restart, command and session identities:

```text
INITIAL_SENTINEL_FENCE_RESOLVED | PREARM_ATTACH_FENCE_RESOLVED
DISCOVERY_ACKED | AUTO_ATTACH_ACKED | CONTROL_ATTACH_RESOLVED
SERVICE_WORKER_ENABLED
REGISTRATION_UPDATED | VERSION_UPDATED
TARGET_ATTACHED | TARGET_DETACHED | TARGET_DESTROYED
CONVERGENCE_FENCE_RESOLVED | CONVERGENCE_RESUME_RESOLVED
INSPECTOR_ENABLED | RUNTIME_ENABLED
WARMUP_START_RESOLVED | WARMUP_RESUME_RESOLVED
WARMUP_TARGET_FENCE_RESOLVED | WARMUP_ATTACH_RESOLVED
STOP_RESOLVED | START_RESOLVED
INSPECTOR_TARGET_CRASHED | INSPECTOR_TARGET_RELOADED
EXECUTION_CONTEXT_CREATED | EXECUTION_CONTEXT_DESTROYED
EXECUTION_CONTEXTS_CLEARED
RESUME_RESOLVED | IDENTITY_PROBE_RESOLVED | TEST_PROBE_RESOLVED
IDENTITY_PROOF_FAILED
APPLICATION_DIAGNOSTIC_RECORDED | OBSERVER_PROTOCOL_FAILED
EVIDENCE_OVERFLOW_RECORDED
OPERATION_TIMED_OUT
RELEASE_RESUME_RESOLVED | AUTO_ATTACH_DISARMED
RELEASE_ATTACH_FENCE_RESOLVED
RELEASE_MANUAL_DETACH_RESOLVED
RELEASE_ZERO_ATTACHED_FENCE_RESOLVED
SERVICE_WORKER_DISABLED | CONTROL_DETACH_RESOLVED
SENTINEL_FENCE_RESOLVED | DISCOVERY_DISABLED | RAW_SOCKET_CLOSED
```

The two retired-context event payloads are exact:

```text
EXECUTION_CONTEXT_DESTROYED = {
  sessionId,
  executionContextId: non-negative safe integer,
  executionContextUniqueId: bounded normalized ID,
  eventSha256
}
EXECUTION_CONTEXTS_CLEARED = { sessionId, eventSha256 }
```

The three bootstrap command events are emitted only after the complete
synchronously dispatched batch has settled and its pending-command records have
been correlated. Their normalized payloads are exact:

```text
RESUME_RESOLVED = {
  processGeneration, leaseEpoch, restartGeneration, sessionId,
  commandId: positive safe integer,
  method: "Runtime.runIfWaitingForDebugger",
  paramsSha256: SHA-256(JCS({})),
  resultSha256: SHA-256(JCS(schema-validated result))
}

IDENTITY_PROBE_RESOLVED = {
  processGeneration, leaseEpoch, restartGeneration, sessionId,
  commandId: positive safe integer,
  method: "Runtime.evaluate",
  paramsSha256: SHA-256(JCS(exact frozen identity params)),
  resultSha256: SHA-256(JCS(schema-validated result)),
  uniqueContextId, workerUrl, registrationScope
}

TEST_PROBE_RESOLVED = {
  processGeneration, leaseEpoch, restartGeneration, sessionId,
  commandId: positive safe integer,
  method: "Runtime.evaluate",
  paramsSha256: SHA-256(JCS(exact frozen test params)),
  resultSha256: SHA-256(JCS(schema-validated result)),
  uniqueContextId,
  diagnosticDisposition: "clean" | "application_exception"
}
```

The resume result schema is the exact successful empty CDP result. The identity
result schema admits only the expected return-by-value object and no
`exceptionDetails`; its `workerUrl` and `registrationScope` are normalized and
must equal frozen authority, and the event's `uniqueContextId` must equal the
frozen fresh context. The optional-test event must carry that same context. Its
response may
contain schema-valid `exceptionDetails`, represented only by the closed typed
diagnostic disposition and its complete result hash. Raw RemoteObject payloads,
exception text and caller strings never enter authority context. A response
whose correlated pending record has another process, epoch, restart, session,
method or parameter hash cannot instantiate one of these events.

For a destroy before the crash transition, numeric and unique IDs must match the
known selected-session context record. After the crash transition, the unique
ID is the authority: the numeric ID remains required native diagnostic evidence
but cannot substitute for, derive or override the unique ID. A missing native
unique ID, numeric fallback or mismatched known pair is protocol failure.

Registration/version/target/context events update immutable latest maps only
through XState actions. Named `isCurrentProcess`, `isCurrentLease`,
`isCurrentRestart`, `isCurrentCommand`, `isExactAuthority`,
`isSelectedPersistentSession`, `isCurrentContextGeneration` and
`isFreshPostReloadContext` guards reject stale, revoked or crossed evidence.
Guarded `always` transitions evaluate retained partial proofs; promise completion
itself never transitions the actor.

`sentinel_fencing` is the raw actor's sole initial node. Its entry sends the
initial page-only sentinel query. Every later initialization command is issued
only by the preceding acknowledged transition below; no shell loop or promise
chain may skip, reorder or duplicate those states.

| XState state                                                                 | Event / guard                                                                                         | Next state                 | Effect                                                                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `sentinel_fencing`                                                           | current `INITIAL_SENTINEL_FENCE_RESOLVED` with exactly one valid sentinel                             | `prearm_attach_fencing`    | freeze sentinel; send exact service-worker-only target fence                                                |
| `prearm_attach_fencing`                                                      | current `PREARM_ATTACH_FENCE_RESOLVED` with zero attached workers                                     | `discovery_enabling`       | retain zero-attachment proof; send exact filtered discovery-enable                                          |
| `prearm_attach_fencing`                                                      | current fence contains any attached worker                                                            | `failed_releasing`         | retain profile-contamination failure; never arm auto-attach                                                 |
| `discovery_enabling`                                                         | current `DISCOVERY_ACKED`                                                                             | `auto_attach_arming`       | retain reply; send exact root auto-attach arm                                                               |
| `auto_attach_arming`                                                         | current worker target/attachment event before arm reply                                               | `auto_attach_arming`       | normalize and retain bounded inventory; install observers on every attached worker                          |
| `auto_attach_arming`                                                         | current `AUTO_ATTACH_ACKED`                                                                           | `control_attaching`        | retain arm reply; send one flattened attach to frozen sentinel                                              |
| `control_attaching`                                                          | current worker attachment or observer-enable reply                                                    | `control_attaching`        | retain identity-bound partial observer proof                                                                |
| `control_attaching`                                                          | current `CONTROL_ATTACH_RESOLVED` for the sentinel                                                    | `service_worker_enabling`  | freeze control session; send `ServiceWorker.enable` on it                                                   |
| `service_worker_enabling`                                                    | current metadata, target, attachment or observer-enable event                                         | `service_worker_enabling`  | retain bounded maps/inventory and correlated observer proofs                                                |
| `service_worker_enabling`                                                    | current `SERVICE_WORKER_ENABLED`                                                                      | `converging`               | retain enable reply; send exact convergence fence                                                           |
| any initialization state                                                     | duplicate/out-of-order acknowledgement, malformed identity or unexpected selected attachment          | `failed_releasing`         | retain protocol failure; perform exact release                                                              |
| `converging`                                                                 | current metadata/target/attachment, observer-enable, detach or convergence-resume reply               | `converging`               | update maps/inventory; observe every related session; resume older paused sessions only after both enables  |
| `converging`                                                                 | current fence and exact convergence                                                                   | `warm_authority_acquiring` | freeze selected authority and preserve its pre-fence observer proofs                                        |
| `warm_authority_acquiring`                                                   | current selected attachment, version or observer-enable reply                                         | `warm_authority_acquiring` | retain guarded partial warm-authority proof only                                                            |
| `warm_authority_acquiring`                                                   | selected running with exact observed unpaused session and both observer replies                       | `warm_authority_ready`     | freeze persistent target/session/origin; send no command                                                    |
| `warm_authority_acquiring`                                                   | selected starting or running with exact observed paused session and both observer replies             | `warm_existing_resuming`   | send one correlated warm-up resume                                                                          |
| `warm_existing_resuming`                                                     | current warm-up resume response or selected starting/running version                                  | `warm_existing_resuming`   | retain exact partial proof only                                                                             |
| `warm_existing_resuming`                                                     | guarded `always`: resume reply, selected running and observer replies                                 | `warm_authority_ready`     | freeze persistent target/session/origin                                                                     |
| `warm_authority_acquiring`                                                   | selected starting or running with exact target ID but without exact session                           | `warmup_target_fencing`    | mark `warmupStarted=false`; send exact filtered target fence                                                |
| `warm_authority_acquiring`                                                   | selected stopped                                                                                      | `warmup_starting`          | mark `warmupStarted=true`; send exactly one warm-up `startWorker`                                           |
| `warmup_starting`                                                            | current `WARMUP_START_RESOLVED`, auto-attachment or version event                                     | `warmup_starting`          | retain partial warm-up proofs only                                                                          |
| `warmup_starting`                                                            | guarded `always`: successful start reply, selected starting or running, and exact target ID           | `warmup_target_fencing`    | send exact filtered target fence                                                                            |
| `warmup_target_fencing`                                                      | current auto-attachment or version event before fence reply                                           | `warmup_target_fencing`    | retain guarded race evidence                                                                                |
| `warmup_target_fencing`                                                      | current `WARMUP_TARGET_FENCE_RESOLVED` and exact auto session exists                                  | `warmup_observing`         | freeze that auto session; send missing observer enables only                                                |
| `warmup_target_fencing`                                                      | current fence and no exact session                                                                    | `warmup_manual_attaching`  | send one exact flattened attach to frozen target                                                            |
| `warmup_manual_attaching`                                                    | first current selected `TARGET_ATTACHED` while manual command is pending                              | `warmup_manual_attaching`  | retain one provisional session without assigning origin                                                     |
| `warmup_manual_attaching`                                                    | different or second current selected `TARGET_ATTACHED`                                                | `failed_releasing`         | retain auto/manual race; release every known session                                                        |
| `warmup_manual_attaching`                                                    | current `WARMUP_ATTACH_RESOLVED` matching zero/one provisional session and no competitor              | `warmup_observing`         | freeze manual session; send observer enables                                                                |
| `warmup_manual_attaching`                                                    | current attach response conflicts with provisional session                                            | `failed_releasing`         | retain auto/manual race; release every known session                                                        |
| `warmup_observing`                                                           | current observer reply, matching attachment or selected version event                                 | `warmup_observing`         | retain exact partial proofs only                                                                            |
| `warmup_observing`                                                           | guarded `always`: both replies, unpaused session, selected running and any required start reply       | `warm_authority_ready`     | freeze persistent target/session/origin; discard warm-up as proof                                           |
| `warmup_observing`                                                           | guarded `always`: both replies and selected session paused                                            | `warmup_resuming`          | send one correlated warm-up resume                                                                          |
| `warmup_resuming`                                                            | current `WARMUP_RESUME_RESOLVED` or selected running version                                          | `warmup_resuming`          | retain exact partial proof only                                                                             |
| `warmup_resuming`                                                            | guarded `always`: resume reply, selected running, both observer replies and any required start reply  | `warm_authority_ready`     | freeze persistent target/session/origin; discard warm-up as proof                                           |
| `warm_authority_ready`                                                       | guarded entry                                                                                         | `controlled_stop`          | send one `stopWorker({versionId})`; never detach selected session                                           |
| `controlled_stop`                                                            | current stop response or same-version activated/stopped update, in either order                       | `controlled_stop`          | retain exact partial proofs only                                                                            |
| `controlled_stop`                                                            | current selected context created before the crash proof                                               | `controlled_stop`          | append its unique ID to the bounded pre-crash generation ledger; complete no stop proof                     |
| `controlled_stop`                                                            | current exact `Inspector.targetCrashed` on the selected target/session                                | `controlled_stop`          | atomically freeze crash, increment context generation, revoke every pre-crash context and clear authority   |
| `controlled_stop`                                                            | current destroy before atomic revocation with exact known numeric/unique context identity             | `controlled_stop`          | retire active authority but retain its pre-crash record for the atomic crash tombstone                      |
| `controlled_stop`                                                            | current destroy after atomic revocation with valid bounded unique ID                                  | `controlled_stop`          | update bounded retired evidence; append an unknown ID to the post-crash tombstone set and hash              |
| `controlled_stop`                                                            | current contexts-cleared before or after atomic revocation                                            | `controlled_stop`          | update bounded retired evidence only; complete no proof and select no transition                            |
| `controlled_stop`                                                            | context created after atomic revocation or duplicate crash                                            | `failed_releasing`         | retain continuity failure; preserve revoked authority                                                       |
| `controlled_stop`                                                            | guarded `always`: stop reply, stopped version, crash/revocation proof and same selected session       | `replacement_starting`     | increment restart generation; send one `startWorker({scopeURL})`                                            |
| `replacement_starting`                                                       | current start response, same-session reload or first same-version starting/running update             | `replacement_starting`     | retain exact partial proofs; after reload re-enable Runtime; first valid version update completes one proof |
| `replacement_starting`                                                       | later exact same-version starting/running update, with absent or exact frozen target                  | `replacement_starting`     | exact duplicate is a no-op; otherwise refresh metadata only, never allocate another proof                   |
| `replacement_starting`                                                       | current Runtime reply and first fresh context with exact script origin after the retained reload      | `replacement_starting`     | require absence from both tombstone sets; bind it to the incremented generation and freeze it               |
| `replacement_starting`                                                       | context before reload, wrong/scope-derived origin, tombstoned/reused ID or second replacement context | `failed_releasing`         | retain continuity failure; publish no bootstrap receipt                                                     |
| `replacement_starting`                                                       | current selected contexts-cleared after exact reload and before any fresh context                     | `replacement_starting`     | update bounded retired evidence only; complete no proof and preserve the open context-admission window      |
| `replacement_starting`                                                       | current selected destroy with valid bounded unique ID in that same window                             | `replacement_starting`     | update evidence; append/hash post-crash tombstone if new; preserve the open context-admission window        |
| `replacement_starting`                                                       | destroy/clear before reload, after fresh context or on another session                                | `failed_releasing`         | revoke replacement authority; outside the narrow safe window the event has no generation discriminator      |
| `replacement_starting`                                                       | guarded `always`: start reply, reload, same-version starting/running, Runtime reply and fresh context | `resuming`                 | synchronously dispatch sole resume, identity, then optional-test command bytes without awaiting replies     |
| `resuming`                                                                   | canonical exact `RESUME_RESOLVED` from the validated batch                                            | `identity_probing`         | retain the authoritative resume receipt, command ID and result hash                                         |
| `resuming`                                                                   | resume rejection, wrong method/session/parameters, malformed result or crossed command ID             | `failed_releasing`         | retain protocol failure; do not accept later evaluation receipts as authority                               |
| `identity_probing`                                                           | canonical exact `IDENTITY_PROBE_RESOLVED` from the validated batch                                    | `test_probe_deciding`      | retain identity proof and exact command/result hashes; compute the batch hash when no test is configured    |
| `identity_probing`                                                           | current response has mismatch, rejection or `exceptionDetails`                                        | `failed_releasing`         | record application diagnostic when applicable; emit `IDENTITY_PROOF_FAILED`; release resumed worker         |
| `test_probe_deciding`                                                        | guarded `always`: no test configured and all resume/identity/running/hash proofs retained             | `bootstrap_proved`         | freeze private restart receipt with exact-null test fields                                                  |
| `test_probe_deciding`                                                        | guarded `always`: test probe configured                                                               | `test_probing`             | await canonical reduction of the already batch-settled optional-test receipt                                |
| `test_probing`                                                               | current `TEST_PROBE_RESOLVED` without protocol failure                                                | `test_probing`             | retain completion/result hash, compute batch hash; emit diagnostic for exception/rejection                  |
| `test_probing`                                                               | guarded `always`: resume, identity, test, running and batch-hash proofs retained                      | `bootstrap_proved`         | freeze private restart receipt                                                                              |
| any of `resuming`, `identity_probing`, `test_probe_deciding`, `test_probing` | current exact selected-version `starting`/`running` metadata                                          | same state                 | retain idempotently; allow only monotonic `starting -> running`, keeping `running` sticky                   |
| any of those four batch states                                               | selected-version identity/status/target drift or `running -> starting`                                | `failed_releasing`         | retain continuity failure; never wait for another metadata event                                            |
| any of those four batch states                                               | duplicate or out-of-canonical-order resume/identity/test response event                               | `failed_releasing`         | retain protocol failure; response arrival order can never select a transition                               |
| any operational state                                                        | `APPLICATION_DIAGNOSTIC_RECORDED`                                                                     | same operational state     | forward to absorbing outer blocked verdict; issue no transition command                                     |
| any operational state                                                        | diagnostic-record-only `EVIDENCE_OVERFLOW_RECORDED`                                                   | same operational state     | forward blocked verdict; retain counters/hash only; preserve cleanup                                        |
| any operational state                                                        | authority-map, attachment or operational-command overflow                                             | `failed_releasing`         | freeze bounded structures; disarm through cleanup reserve; normal release is impossible                     |
| `bootstrap_proved`                                                           | guarded `always`                                                                                      | `release_resuming`         | create one release deadline and preserve full attachment inventory                                          |
| any non-final state                                                          | protocol failure or timeout                                                                           | `failed_releasing`         | retain failure; perform exact release                                                                       |
| any acquisition/restart/probe state outside `release_*`                      | selected detach or continuity failure                                                                 | `failed_releasing`         | retain failure; perform exact release                                                                       |

The stop proof requires only positive native facts: the successful `stopWorker`
response, the selected version `activated/stopped` and exact
`Inspector.targetCrashed` on the retained selected target/session. Reducing that
crash event atomically revokes every pre-crash context and completes the
crash/revocation proof; no Runtime context-destroyed or contexts-cleared event is
required or awaited. The final start proof requires the successful `startWorker`
response, `Inspector.targetReloadedAfterCrash` on the same target/session IDs,
the same version ID in `starting` or `running`, and exactly one fresh context
created after that reload. A selected attach/detach, changed target/session/version
or pre-reload/revoked/second context is terminal; unrelated attachments remain
blocking and cleanup-owned.

Replacement correlation freezes:

```text
(processGeneration, leaseEpoch, restartGeneration,
 registrationId, versionId, scopeURL, scriptURL,
 targetId, sessionId, attachmentGeneration, attachmentOrigin,
 crashEventSha256, contextGeneration, revokedUniqueContextIdsSha256,
 postCrashDestroyedUniqueContextIdsSha256,
 reloadEventSha256, uniqueContextId,
 startCommandId, executionContextEventSha256,
 resumeCommandId, resumeResultSha256,
 identityCommandId, identityResultSha256,
 testCommandId, testResultSha256,
 bootstrapCommandBatchSha256)
```

`revokedUniqueContextIdsSha256` is SHA-256 over RFC 8785 JCS of the sorted,
normalized cumulative tombstone IDs immediately after the atomic crash action.
It commits the private revocation set without exposing those IDs in the public
receipt.

`postCrashDestroyedUniqueContextIdsSha256` is initialized in that same atomic
crash action as the SHA-256 of JCS `[]`, then recomputed over the sorted,
normalized post-crash destroyed-ID set on every valid new ID. It is frozen into
the replacement correlation before the first fresh context is admitted and
commits the second private tombstone set without exposing its IDs.

`Runtime.executionContextCreated.context.uniqueId` must be non-empty UTF-8 of at
most 512 bytes with no NUL, CR or LF, matching the global ID bound. Numeric
`contextId` is diagnostic only.
The event is admissible only after the exact reload has been reduced, on the
retained session, in the incremented `contextGeneration`, and when its
`uniqueContextId` is absent from both `revokedUniqueContextIds` and
`postCrashDestroyedUniqueContextIds`. The first admissible post-reload context
must also carry `context.origin === frozen scriptURL`; the
root scope, with or without its trailing slash, is not an admissible substitute.
That native field corroborates event identity but never replaces the fixed
URL/scope identity probe. The context is single-assignment through resume and
raw release; any pre-reload context, mismatched origin, reused revoked ID or
second admissible context event is terminal. A destroy/clear reduced while still
in `controlled_stop` after the crash may update retired-generation evidence
only for contexts-cleared; a valid destroy additionally tombstones its native
unique ID. In `replacement_starting`, the same selected-session safe-window
rules apply only after exact reload and before the first fresh context.
Everywhere else the lifecycle event is terminal because it carries no
trustworthy context-generation discriminator.
Event hashes are SHA-256 over RFC 8785 JCS of the complete schema-validated
parameters.

The context authority map retains the bounded `uniqueContextId`, generation,
session identity, `originMatchesScriptURL:true` and complete event hash; it does
not duplicate the full origin URL. Origin equality is checked against the frozen
script URL before mutation, so the 2,048-byte context-entry budget remains
closed.

The sole resume is synchronously dispatched first on the exact selected session
with method `Runtime.runIfWaitingForDebugger` and exact params `{}`. The fixed
identity evaluation and then optional test evaluation are synchronously
dispatched immediately afterward, without awaiting the resume promise, with
`uniqueContextId:<frozen>`, `awaitPromise:true`, `returnByValue:true`,
`includeCommandLineAPI:false` and `silent:false`; `contextId` is forbidden. The
fixed identity expression returns only `globalThis.location.href` and
`globalThis.registration.scope`, which must equal the frozen script URL and root
scope. The optional test expression is explicit test input. For that optional
probe, a valid protocol response with `exceptionDetails` or a rejected awaited
result records an application diagnostic and still completes its operational
state so release can run. An identity mismatch/rejection is both a diagnostic
and failed authority; command/transport/schema failure is
`OBSERVER_PROTOCOL_FAILED`. Command IDs are positive safe integers and strictly
consecutive in resume, identity, optional-test order. `testCommandId` and
`testResultSha256` are both exact `null` when no test probe is configured and
both non-null otherwise. Result hashes are SHA-256 over RFC 8785 JCS of the
complete schema-validated CDP `result` object.

`bootstrapCommandBatchSha256` is single-assignment after all canonical command
events have been reduced. The normalized command proof schemas are exactly:

```text
ResumeCommandProofV1 = {
  ordinal: 0, commandId: resumeCommandId,
  method: "Runtime.runIfWaitingForDebugger",
  paramsSha256: SHA-256(JCS({})), resultSha256: resumeResultSha256
}
IdentityCommandProofV1 = {
  ordinal: 1, commandId: identityCommandId,
  method: "Runtime.evaluate", paramsSha256: identityParamsSha256,
  resultSha256: identityResultSha256
}
TestCommandProofV1 = {
  ordinal: 2, commandId: testCommandId,
  method: "Runtime.evaluate", paramsSha256: testParamsSha256,
  resultSha256: testResultSha256
}
```

When `testProbeConfigured` is false, the hash preimage is exactly
`{schemaVersion:1, processGeneration, leaseEpoch, restartGeneration, sessionId,
testProbeConfigured:false,
commands:[ResumeCommandProofV1,IdentityCommandProofV1]}`. When it is true, the
preimage is the same closed object with `testProbeConfigured:true` and
`commands:[ResumeCommandProofV1,IdentityCommandProofV1,TestCommandProofV1]`.
`bootstrapCommandBatchSha256` is SHA-256 over RFC 8785 JCS of the applicable
complete object. There are no additional or omitted fields.

The two evaluation parameter hashes commit the complete exact
schema-validated CDP params, including expression and frozen
`uniqueContextId`; they are not hashes of caller-controlled summaries. The raw
receipt retains the bounded normalized command records and their preimages.
The public receipt exposes only the enclosing bootstrap commitment. A missing,
duplicate, non-consecutive or differently ordered record cannot produce
`bootstrapCommandBatchSha256` and is terminal even if every individual promise
resolved successfully.

No probe value or diagnostic text selects a transition. Every foreign,
duplicate, malformed, stale-generation or unrelated live service-worker
attachment observed while root auto-attach is armed is blocking and
cleanup-owned. Complete non-colliding metadata without a live attachment is
inert.

The selected `TARGET_DETACHED` rule is terminal only before entry into
`release_resuming`. Inside the explicit `release_*` region, an exact current
detach for a known inventory or control member is expected release evidence and
is reduced only by the state-specific rows below. An unknown, crossed, duplicate
or otherwise malformed detach remains terminal.

## Exact raw release

Release keeps an append-only inventory of every auto-attached session. It remains
open through disarm acknowledgement and an exact protocol round-trip barrier;
elapsed time is never used as an inventory fence.

Release is the final hierarchical region of `rawWorkerRestartMachine`, with these
explicit states:

| State                                   | Event / guard                                                                                | Next state                         | Effect                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| `release_resuming`                      | entry                                                                                        | `release_resuming`                 | send one resume for every paused member lacking a prior authoritative resume      |
| `release_resuming`                      | current `RELEASE_RESUME_RESOLVED`                                                            | `release_resuming`                 | retain exact member reply                                                         |
| `release_resuming`                      | current `TARGET_ATTACHED`                                                                    | `release_resuming`                 | append, observe and resume if paused; mark verdict blocked                        |
| `release_resuming`                      | current inventory `TARGET_DETACHED`                                                          | `release_resuming`                 | retain exact detach; remove live mapping                                          |
| `release_resuming`                      | guarded `always`: every paused member resumed                                                | `release_disarming`                | send exact root `setAutoAttach(false)` once                                       |
| `release_disarming`                     | current `TARGET_ATTACHED` before disarm reply                                                | `release_disarming`                | append, observe and resume if paused; require detach; mark verdict blocked        |
| `release_disarming`                     | exact `TARGET_DETACHED` for inventory member                                                 | `release_disarming`                | retain member detach; remove live mapping                                         |
| `release_disarming`                     | current `RELEASE_RESUME_RESOLVED` for late member                                            | `release_disarming`                | retain its cleanup-only resume reply                                              |
| `release_disarming`                     | current `AUTO_ATTACH_DISARMED`                                                               | `release_attach_fencing`           | retain disarm reply; send exact service-worker `Target.getTargets` fence          |
| `release_attach_fencing`                | current `TARGET_ATTACHED` before fence response                                              | `release_attach_fencing`           | append, observe/resume, require detach; mark verdict blocked                      |
| `release_attach_fencing`                | current inventory detach/resume reply                                                        | `release_attach_fencing`           | retain exact cleanup proof                                                        |
| `release_attach_fencing`                | current `RELEASE_ATTACH_FENCE_RESOLVED`                                                      | `release_attach_fencing`           | require attached targets equal exactly known live manual members; close inventory |
| `release_attach_fencing`                | guarded `always`: fence retained, every paused member resumed and every auto member detached | `release_manual_detaching`         | send one detach for each still-live manual member                                 |
| `release_manual_detaching`              | current `RELEASE_MANUAL_DETACH_RESOLVED`                                                     | `release_manual_detaching`         | retain exact member reply                                                         |
| `release_manual_detaching`              | current manual-member `TARGET_DETACHED`                                                      | `release_manual_detaching`         | retain exact event; remove live mapping                                           |
| `release_manual_detaching`              | guarded `always`: every manual reply/event retained and no member live                       | `release_zero_attached_fencing`    | send second exact service-worker target fence                                     |
| `release_zero_attached_fencing`         | current `RELEASE_ZERO_ATTACHED_FENCE_RESOLVED` with zero attached workers                    | `release_service_worker_disabling` | send `ServiceWorker.disable` once                                                 |
| `release_service_worker_disabling`      | current `SERVICE_WORKER_DISABLED`                                                            | `release_control_detaching`        | send exact control-session detach once                                            |
| `release_control_detaching`             | current `CONTROL_DETACH_RESOLVED` only                                                       | `release_control_detaching`        | retain command reply                                                              |
| `release_control_detaching`             | exact control `TARGET_DETACHED` only                                                         | `release_control_detaching`        | retain event proof                                                                |
| `release_control_detaching`             | guarded `always`: reply and event                                                            | `release_sentinel_fencing`         | send exact page-only sentinel query                                               |
| `release_sentinel_fencing`              | current exact `SENTINEL_FENCE_RESOLVED`                                                      | `release_discovery_disabling`      | send exact discovery-disable command                                              |
| `release_discovery_disabling`           | current `DISCOVERY_DISABLED`                                                                 | `release_socket_closing`           | require zero pending commands; remove listeners; close socket                     |
| `release_socket_closing`                | current `RAW_SOCKET_CLOSED`                                                                  | `released`                         | freeze raw-release receipt and return lease to `owner_none`                       |
| any release state after inventory close | current `TARGET_ATTACHED`                                                                    | `failed_releasing`                 | retain protocol failure; resume/detach cleanup-only                               |

The first attach fence is sent only after the disarm response and uses the same
exact service-worker-only filter as acquisition. CDP messages on the one
WebSocket are processed sequentially: all earlier attachment callbacks are
reduced into the inventory before the current fence response can close it. That
response may report `attached:true` only for the exact known live manual members;
every auto member must already be detached. After manual detaches, a second exact
fence must report zero attached service workers. A `TARGET_ATTACHED` after the
first response is a protocol invariant failure; cleanup resumes/detaches it if
possible but the verdict cannot pass. A missing proof waits until the absolute
release deadline and fails.

1. every paused inventory member receives a correlated successful
   `Runtime.runIfWaitingForDebugger` response; the replacement's authoritative
   resume counts;
2. root sends exact `Target.setAutoAttach` false without `sessionId` or filter:

   ```json
   {
     "autoAttach": false,
     "waitForDebuggerOnStart": false,
     "flatten": true
   }
   ```

3. after the disarm response, root sends one exact filtered `Target.getTargets`
   barrier; attached targets equal only known manual members and the response
   freezes the complete inventory;
4. exact `Target.detachedFromTarget` for every auto-attached session is retained;
5. each manual worker session receives one explicit
   `Target.detachFromTarget({sessionId})`, with correlated response and detach
   event; no worker session remains mapped;
6. a second exact service-worker target fence proves zero attached workers;
7. the control session acknowledges `ServiceWorker.disable`;
8. the manually attached control session receives exact detach reply and event;
9. a fresh page-only `Target.getTargets` response proves the frozen sentinel
   still exists, is `about:blank`, is not attached and is the sole page target
   after fixture-created pages have been closed for a runtime handback;
10. root acknowledges `Target.setDiscoverTargets({"discover":false})` with no
    filter;
11. pending command count reaches zero, listeners are removed, the raw WebSocket
    close handshake is observed, and the lease returns to `owner_none`.

Disarm/fence rejection, a missing detach, post-fence attachment, pending command,
listener leak, socket loss before receipts or close timeout makes the verdict
failed. Cleanup still resumes/detaches what it can, but cannot create a pass.

For a zero-overflow eligible epoch, the raw-release receipt includes the complete
command ledger and attachment inventory plus resume/disarm/fence/detach proofs,
control-session release, close receipt and deadline. A failed overflow receipt
contains only bounded records, chain digest and counters and cannot authorize a
handoff. No empty inventory, state label or local boolean substitutes.

## Playwright handoff and multi-epoch restart

Only `owner_none` with a complete raw-release receipt may request the pure
authority projection. Only `playwright_authority_ready` with the current exact
projection receipt/hash may reserve a Playwright epoch. Projection and schema
validation therefore finish before any lease, WebSocket or Playwright object
exists. The lease actor then opens one tracked WebSocket implementing Playwright's
public `ConnectOverCDPTransport` interface. It schema-parses inbound JSON objects,
serializes outbound objects, and exposes a single-assignment close receipt. The
transport is already open before it is passed to Playwright; no private
Playwright module or endpoint-string overload is used. The reserve occurs before
calling:

```text
chromium.connectOverCDP(trackedTransport, {
  isLocal: true,
  noDefaults: true,
  timeout: remainingDeadline
})
```

The endpoint stays private to the lease actor. Connect resolution acknowledges
Playwright's internal root auto-attach. No raw transport, raw listener or paused
raw session may exist then. On normal release, all three current-epoch proofs are
mandatory: resolved `browser.close()`, Playwright `disconnected`, and the tracked
transport's WebSocket close receipt. They may arrive in any order.

If `connectOverCDP` rejects before returning a Browser, the tracked transport is
still owned by `playwright_connecting`. The actor calls its idempotent `close`,
waits for the exact current transport close receipt and emits
`PLAYWRIGHT_CONNECT_FAILED_CLOSED`; only then may failure cleanup acquire another
lease. There is no impossible `browser.close()`/`disconnected` requirement when
no Browser was returned, and a connection rejection without the tracked close
receipt keeps the lease occupied and the verdict failed.

Before any fixture capability is exposed, the Playwright owner installs a
private diagnostic subgraph on the same tracked root transport using public
Playwright CDP sessions only:

1. it identifies the preserved sentinel as the sole default-context
   `about:blank` page and creates `context.newCDPSession(sentinelPage)`;
2. that sentinel session acknowledges `ServiceWorker.enable` and retains exact
   registration/version/error events for the frozen authority;
3. one `browser.newBrowserCDPSession()` sends an exact filtered
   `Target.getTargets`, identifies the sole frozen worker target, and calls
   `Target.attachToTarget({targetId, flatten:false})`;
4. the returned nested diagnostic session is controlled only through correlated
   `Target.sendMessageToTarget` commands and schema-valid
   `Target.receivedMessageFromTarget` messages on that browser CDP session; it
   acknowledges `Inspector.enable` and `Runtime.enable`, captures
   `Inspector.targetCrashed`, `Inspector.targetReloadedAfterCrash`,
   `Runtime.exceptionThrown`, `Runtime.consoleAPICalled` and context events, and
   freezes exactly one current `uniqueContextId`;
5. a fixed identity evaluation on that unique context matches the raw authority
   before the facade exposes any page, worker or evaluate operation.

Playwright 1.61.1's internal `CRServiceWorker` session is never treated as a
diagnostic observer because it does not subscribe to
`Runtime.exceptionThrown`. The explicit nested session above is the only
Playwright-epoch runtime diagnostic authority. An unexpected worker crash,
reload, detach or second context during a Playwright epoch records a blocking
diagnostic and prevents further fixture effects; the epoch proceeds only to
release. Root-transport handoff itself exposes no fixture capability and starts
no test effect. The model claims complete diagnostics inside each owned raw or
Playwright epoch and pre-effect instrumentation, not continuous telemetry during
the interval in which no root transport exists.

Handoff requires:

1. `Browser.getVersion` matches the frozen process receipt;
2. `browser.contexts()` exposes exactly the one default persistent context;
3. exactly one extension service worker has the frozen script URL and native
   URL/scope identity;
4. the sentinel CDP session observes the same non-deleted registration, version
   ID, scope and script as the raw restart receipt;
5. the nested runtime diagnostic session is attached to that exact target,
   observes exactly one current context and passes native URL/scope identity;
6. the replacement is running and both diagnostic sessions remain attached
   before the fixture exposes pages or evaluation.

Zero/two contexts, zero/two workers, version drift, missing observer reply,
missing identity, connection timeout or early process exit is terminal.

Normal Playwright release first closes fixture-created pages while preserving
the sentinel, then performs this exact diagnostic teardown before
`browser.close()`:

1. nested `Runtime.disable` and `Inspector.disable` replies are correlated;
2. `Target.detachFromTarget({sessionId})` reply and matching nested detach event
   are both retained;
3. sentinel `ServiceWorker.disable` is acknowledged;
4. sentinel and browser CDP `detach()` promises resolve and no listener/pending
   command remains;
5. only then may `browser.close()` run, after which its promise, Playwright's
   `disconnected` event and the tracked transport close receipt are all required.

A naturally detached diagnostic session, a missing disable/detach proof or any
diagnostic event after listener removal blocks the verdict and keeps cleanup
responsible for the transport.

`restartServiceWorkerForProbe(probe?)` is a session transition, not an in-place
Worker mutation:

```text
playwright epoch N
  -> close all fixture-owned pages
  -> browser.close() disconnect receipt
  -> owner_none
  -> raw epoch N+1 same-process restart and optional probe
  -> exact raw release
  -> owner_none
  -> Playwright epoch N+2 reconnect and correlation
  -> detached RestartReceipt DTO
```

The Chromium PID, profile, extension ID, registration, version and script remain
constant. Every old `Page`, `Worker`, `CDPSession`, Browser and context handle is
invalid after Playwright release and may not cross the epoch. The harness stores
only detached page URLs before release; it closes all fixture-created pages,
preserves only the private sentinel, and callers reopen the side panel to obtain
new handles after reconnect.

The public restart result is exactly this deeply frozen, schema-validated DTO;
all integers are non-negative safe integers and every hash is lowercase
64-character hexadecimal:

```text
RestartReceiptV1 = {
  schemaVersion: 1,
  processGeneration: integer,
  rawLeaseEpoch: integer,
  playwrightEpoch: integer,
  restartGeneration: integer,
  workerUrl: string,
  authoritySha256: string,
  bootstrapSha256: string,
  receiptSha256: string
}
```

`workerUrl` equals the exact packaged script URL.
`authoritySha256 = SHA-256(JCS({extensionId, registrationId, versionId,
scopeURL, scriptURL}))`.
`bootstrapSha256 = SHA-256(JCS({processGeneration, rawLeaseEpoch,
restartGeneration, targetId, sessionId, attachmentGeneration, attachmentOrigin,
crashEventSha256, contextGeneration, revokedUniqueContextIdsSha256,
postCrashDestroyedUniqueContextIdsSha256, reloadEventSha256, uniqueContextId, startCommandId,
executionContextEventSha256, resumeCommandId, resumeResultSha256,
identityCommandId, identityResultSha256, testCommandId, testResultSha256,
bootstrapCommandBatchSha256}))`.
`receiptSha256` is SHA-256 JCS of the eight preceding public fields, excluding
itself. The preimages and full raw receipt remain private.

`evaluateInRestartedServiceWorker<T>(receipt, expression)` first parses V1, then
compares every public field and all three hashes with the controller's one
current private receipt. It also requires the current process generation,
Playwright epoch, restart generation and current nested diagnostic context before
sending `Runtime.evaluate` with that context's `uniqueContextId`,
`awaitPromise:true` and `returnByValue:true`. Any mutation or older/newer receipt
rejects before evaluation. The arbitrary test expression is an effect only and
cannot transition the harness. This API proves settings and alarm persistence
without exposing or using stale handles.

## Global shutdown and cleanup

After use and diagnostic settlement, Playwright releases exactly as above. The
machine reserves a final `shutdown_connecting` raw lease, opens one tracked
socket, and requires a current `Browser.getVersion` response whose complete
frozen hash equals the process endpoint receipt. Only
`SHUTDOWN_ENDPOINT_VERIFIED` enters `shutdown_owned` and sends `Browser.close`.
Because the process may close the socket before replying, a normal shutdown
receipt accepts either:

- current `SHUTDOWN_BROWSER_CLOSE_RESOLVED`, carrying the exact process,
  shutdown lease, transport and command IDs, followed by child exit; or
- current `SHUTDOWN_SOCKET_CLOSED_AFTER_COMMAND`, emitted only when the tracked
  socket's close callback is observed after the exact `Browser.close` bytes were
  dispatched and before any child-exit event, followed by exact child exit under
  the same deadline.

The socket receipt freezes command-dispatch and close monotonic timestamps and
the complete current IDs; a generic socket close cannot instantiate it. The
first current child-exit event is reduced together with the already-retained
close proof. `PROCESS_EXITED` before either proof is a non-causal unexpected exit
and enters failed profile removal. A later response, socket event or cleanup
cannot retroactively convert it into normal shutdown.

The child `exit` event, frozen PID/process generation and absence of a replacement
process are mandatory. Profile removal begins only after exit. Artifact
reverification, process exit and profile removal are all required for pass.

`passed` is provisional until the single `VERDICT_ARCHIVED` transition. A late
`APPLICATION_DIAGNOSTIC_RECORDED` or `EVIDENCE_OVERFLOW_RECORDED` in
`profile_removing` or `passed` revokes eligibility and follows the explicit
failed-archive branch. Archiving success and checking `eligible` are one guarded
transition; no event gap can archive a blocked verdict as a pass.

If shutdown raw acquisition or `Browser.close` fails, cleanup sends `SIGTERM`
and then `SIGKILL` only to the owned live child under bounded deadlines. If the
exact current child has already emitted `PROCESS_EXITED`, cleanup closes local
transport objects, skips every connection/signal operation and transitions
directly to profile removal while preserving the original failed verdict. Forced
termination can archive a failed verdict, never authorize pass. Failure to prove
exit or remove the profile stays failed and is reported with complete evidence.

## Hostile verification obligations

Implementation is not reviewable as complete until deterministic tests prove:

1. Playwright launch/connect before first raw release, raw acquisition while
   Playwright owns, a second raw socket and a second Playwright connection are
   rejected before opening a transport;
2. `DevToolsActivePort` absent, stale, symlinked, non-regular, one/three-line,
   whitespace/control-bearing, invalid port/path, wrong generation and child
   exit before verification all fail closed;
3. the manual argument allowlist contains one exact profile, loopback debugging,
   sealed extension paths and deterministic mode, with no shell or passthrough;
   raw initialization proves sentinel and zero pre-arm attachments, then
   discovery, auto-attach, control attach and ServiceWorker enable in that exact
   XState order, while every duplicate/out-of-order acknowledgement fails;
4. transient initial overlapping versions and a provisional redundant version
   wait for the exact convergence fence with zero stop/start; every paused
   related attachment is observed/resumed once and barred from replacement
   authority, while permanent overlap times out; permutations of Inspector and
   Runtime enable replies before/after the fence and every older-session resume
   reply preserve the same proof;
5. an already-running selection and a starting selection with no raw session
   perform no warm-up and one final start; a paused starting selection is
   observed/resumed without deadlock; a stopped selection performs exactly one
   non-authoritative warm-up plus one final start; all perform one controlled
   stop and none detaches the selected session;
6. an auto-attachment arriving while the manual attach command is pending is
   either the one response-correlated provisional session or terminal; every
   ordering that produces two selected sessions fails and releases both;
7. stop response, stopped metadata and `Inspector.targetCrashed` in every
   meaningful order cannot start the final replacement until all three proofs
   exist on the same target/session; the exact crash atomically revokes every
   pre-crash context; absence of destroy/clear never blocks, contexts-cleared is
   evidence-only, and a valid post-crash destroy atomically tombstones its
   native unique ID without authorizing progress; after leaving that state,
   only the exact same-session post-reload/pre-context window is admissible and
   every other occurrence is terminal;
8. the final start accepts no new selected attachment: it requires
   `Inspector.targetReloadedAfterCrash`, same-version metadata and then one fresh
   context on the retained session in the incremented context generation whose
   native `origin` equals the full frozen `scriptURL`; pre-reload context,
   scope-derived origin, revoked-ID reuse, replacement, detach, deletion,
   redundancy or script/scope drift is rejected;
   the native `starting(no targetId) -> starting(exact targetId) -> running`
   metadata sequence is idempotent after its first proof, while any identity or
   target drift remains terminal; exact reload followed by selected-session
   contexts-cleared and then one fresh context succeeds; exact reload followed
   by `destroy(X)` then `create(X)` fails, while `destroy(X)` then a distinct
   fresh context succeeds; the same lifecycle event before reload or after that
   context is terminal;
9. malformed/oversized/control-bearing context IDs, missing destroyed unique
   IDs, numeric fallback, wrong native URL/scope, extra identity fields, any
   crash-time or post-crash tombstoned ID reused after reload, retired-evidence
   event 4,097, execution-context authority slot 4,097 and a second context
   before raw release never publish a valid receipt;
10. a deterministic same-session client blocks every `Runtime.evaluate` until
    it has processed `Runtime.runIfWaitingForDebugger`: the revision-18
    identity-first order must reproduce the finite-deadline deadlock, while the
    revision-19 resume-first batch must synchronously expose resume, identity
    and optional-test bytes before any reply is awaited and then settle; both
    probes use the exact frozen `uniqueContextId`; IDs are strictly consecutive
    in resume/identity/optional-test order with and without the optional probe;
    out-of-order promise responses reduce canonically through explicit
    resume/identity/optional-probe states; gaps, crossings, duplicates, wrong
    methods/sessions/parameters/results and batch-hash drift fail closed; exact
    selected-version `running` remains sticky when emitted before resume
    reduction, between resume and identity, between identity and test, or after
    the final reduction; exact duplicates are no-ops in each batch state, while
    `running -> starting` and every authority drift are terminal in each state;
    the raw client tests continue to prove immediate socket sends and
    response-by-ID correlation; application warnings block only the verdict and
    protocol failures interrupt immediately;
11. every foreign/duplicate live attachment is blocking and release-owned, while
    complete non-colliding metadata remains inert;
12. release accepts attachments during `release_resuming`, disarms auto-attach,
    closes inventory only after the exact protocol fence, and treats any
    post-fence attachment as terminal; a sleep alone never authorizes release;
13. missing resume, fence, auto-detach, ServiceWorker disable, discover-disable,
    control detach, zero-pending ledger, listener disposal or raw close receipt
    prevents Playwright handoff and pass; the exact sentinel is preserved,
    unattached and sole page at every handback;
14. `connectOverCDP` with zero/two contexts, zero/two exact workers or divergent
    raw/Playwright identity fails before fixture exposure; a connection rejection
    with no Browser still closes the tracked public transport before releasing
    its current lease or reserving any later lease;
15. the sentinel ServiceWorker observer and nested non-flatten Runtime/Inspector
    observer are both installed before fixture effects; exception, unexpected
    crash/reload, missing observer reply or second context blocks the verdict;
16. Playwright release disables/detaches both diagnostic sessions before
    `browser.close`, and requires browser/disconnected/transport close proofs;
17. a runtime restart closes fixture pages, proves Playwright disconnection,
    rejects every old handle, performs a sole-owner persistent-session raw
    restart, reconnects with a higher epoch and accepts only exact V1 receipts;
18. settings, onboarding snapshot, IndexedDB-visible data and the `auto-scan`
    alarm persist across the same-process/profile runtime restart and reconnect;
19. raw acquisition before Playwright `disconnected`, a late old-epoch event or
    stale/mutated/self-hash-invalid receipt/evaluation cannot mutate the new epoch;
20. process output endpoint lines are redacted before retention and every malformed
    endpoint path, including non-canonical UUID spellings, fails admission;
21. one restart maximum, the internal global deadline and the larger Playwright
    timeout preserve cleanup; an already-exited child skips reconnect/signals and
    proceeds directly to profile removal with the original failure;
22. normal final shutdown version-checks and closes the exact child before profile
    removal; `PROCESS_EXITED` without a preceding exact close response or causal
    post-command socket close is rejected; forced TERM/KILL cleans an orphan but
    makes the gate red;
23. pre/post artifact digests, runtime diagnostics, process exit and profile
    removal all precede provisional pass; a blocking diagnostic/protocol event in
    every phase through `profile_removing` and between `passed` and archive can
    produce only an archived failure;
24. deterministic unit and machine tests prove this pending revision's complete
    projection/error matrix, including all hostile DTO/reflection inputs and all
    six self-consistent foreign-authority mutations, with zero reservation,
    transport or connection on every rejection;
25. the targeted cold-boot and retained-session raw-owner restart smoke runs
    against the rebuilt exact production package with `--workers=1` and
    `--repeat-each=3`; every repetition must show resume dispatch before both
    evaluations, exact batch/receipt hashes, identity proof, selected-version
    `running`, exact release, this pending revision's retained source-bound
    authority DTO and no blocking diagnostic; any failure falsifies this revision;
26. the full packaged scenario inventory then runs from the same canonical sealed
    artifact without DEV stubs or external backend.
27. Playwright package/browser metadata, executable preflight and exact CDP
    product/revision/JS versions reject every drift; diagnostic, command, nested
    message and attachment floods stay within both entry-count and canonical-byte
    caps, emit typed overflow, complete cleanup and can never pass.

## Invariants

1. The deterministic XState actors decide every state transition; I/O and text
   produce signals only.
2. At most one harness-created root CDP transport exists, and its kind always
   equals the current lease state.
3. No Playwright connection overlaps a raw restart; no raw connection overlaps
   Playwright.
4. The same process, profile, extension ID, registration, version and script are
   preserved across restart epochs.
5. Pre-bootstrap proof requires one retained selected session; exact
   `targetCrashed` atomically revokes the complete pre-crash context generation,
   every later destroyed unique ID is separately tombstoned, exact same-identity
   `targetReloadedAfterCrash` precedes one fresh ID absent from both sets whose
   native origin equals the frozen script URL. The sole resume command bytes
   precede both probe command bytes; exact resume receipt, probe replies, batch
   commitment and running proof complete afterward. No Runtime destroy/clear
   event is a stop prerequisite or may restore revoked authority.
6. Initial installation may converge; frozen authority may not mutate.
7. Every handle and event is epoch-bound. Old handles and stale receipts are
   unusable after release.
8. Every raw paused session is resumed, root auto-attach is disarmed, every
   auto-attached session is detached, ServiceWorker/discovery are disabled, the
   control session is detached and the socket is closed before handoff.
9. Playwright handoff is identity-checked and explicitly Runtime/Inspector
   observed on the same transport before UI use.
10. Endpoint capabilities are never retained in logs or public evidence.
11. No Vite server, DEV stub, external backend, new browser process or product
    mutation is introduced by a restart.
12. Cleanup failure can never retain or create a pass.
13. CI runs the canonical command with pinned Chromium and uploads complete
    failure evidence.
14. A current replacement-version proof is single-allocation but not
    single-observation: repeated guarded starting/running metadata is idempotent
    and can never fail solely because the proof already exists.
15. Post-reload Runtime clear/destroy is admissible only before any fresh context
    authority exists; clear is evidence-only, destroy adds its bounded unique ID
    to the post-crash tombstone set, the window closes on first context admission,
    and both events are terminal everywhere else outside `controlled_stop`.
16. A paused replacement cannot enter a same-session probe-before-resume causal
    cycle: the sole resume bytes are synchronously dispatched first, then fixed
    identity and optional-test bytes, with no await between sends. Exact
    consecutive command IDs, canonical resume/identity/test receipt reduction,
    result hashes and `bootstrapCommandBatchSha256` are proven before bootstrap.
    Exact `running` metadata is sticky across every batch state, while any
    regression or identity drift is terminal.

## Primary references

- <https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-setAutoAttach>
- <https://chromedevtools.github.io/devtools-protocol/tot/Inspector/>
- <https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-evaluate>
- <https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker/>
- <https://chromium.googlesource.com/chromium/src/+/38ad3e85e529e73d11a4cf1b03f9c28e0ef94b42/content/browser/devtools/service_worker_devtools_agent_host.cc>
- <https://chromium.googlesource.com/chromium/src/+/d661c0dd3ab2d9b38a693e74e56d4307b0290139/content/browser/devtools/service_worker_devtools_manager.cc>
- <https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp>
- <https://playwright.dev/docs/next/chrome-extensions#service-worker-idle-suspension-mv3>
- local pinned Playwright 1.61.1 source lines cited in the falsification section
