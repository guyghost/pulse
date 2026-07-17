# Connector health workflow model

Status: **MODEL REVISION 6 — pending independent review; implementation
forbidden until approval**.

Pending behavior SHA-256: `bb08a3394436db7e3484007faac7546709da7bbbc12a894b7a3aa2c4d82e554d`.

The normalized pending behavior hash is SHA-256 of the complete raw UTF-8/LF
bytes of this file after replacing only the value between backticks on the
`Pending behavior SHA-256` line with the literal
`__PENDING_BEHAVIOR_SHA256__`. The surrounding backticks, period and every
other byte remain unchanged. The input must have no BOM and no CRLF or other
normalization is permitted. A reviewer must reproduce that substitution and
compare the result before approval.

Revision 4 was recorded as approved at historical hash
`7b66fcc534c62ec291ed7cd7bbe0d498686edeec2c70536c3c2c7b9a3d1d2021`, but
that approval is **rejected and withdrawn** by the 2026-07-17 cold review: the
revision did not declare a reproducible hash convention, did not preserve the
reviewed byte blob and its current bytes could not reproduce the recorded
digest. Revision 4 also lacked executable XState authority, killed only the
health-runner PID rather than its complete Linux process group, admitted
registry drift, incompletely rebound downloaded evidence to the current run,
used the runner's implicit Node in conclusion and had an incomplete
verification matrix and inaccurate permission documentation. No revision-4
approval or implementation authority survives.

Revision 5 was frozen at historical hash
`06b9a04e445be08f9a7fea06320b9e85ea57149047de757c65e2ecff28cbaac0`, but
its approval is **rejected and withdrawn** by the revision-6 review. It claimed
that process-group emptiness proved every descendant gone although trusted code
could escape the group, required a branch-protection API decision that
`contents:read` cannot authorize, and conflated conclusion bootstrap failure
before actor start with an XState terminal. No revision-5 approval or
implementation authority survives.

Revision 6 closes only those three findings while preserving the remaining
revision-5 contracts. Any semantic edit, including a state, event, guard,
effect, permission, retry, cancellation, registry, trust boundary or
verification change, invalidates this pending hash and requires a new
independent review.

## Scope

This model owns the scheduled and manually dispatched GitHub Actions workflow
that executes the committed fixture-only connector health checks, publishes one
bounded evidence envelope and, on a proved health failure, creates at most one
correlated GitHub issue. It does not enable or disable a connector, change
extension settings, publish a release, scrape a live authenticated session or
decide any application transition.

The health command produces a signal. The deterministic workflow below decides
the disposition, issue-write admission and final workflow conclusion. No LLM,
free-form detail, issue title or console wording decides a transition.

The executable trust boundary contains the exact reviewed checkout, committed
health/test scripts and frozen dependency graph. Connector HTML/JSON fixtures
are hostile data but are never executable code. This workflow is not a sandbox
for malicious committed tests, dependencies or native code: code that
deliberately changes session/process group, daemonizes or otherwise escapes the
declared launcher contract is outside the health claim. Process-group cleanup
below proves emptiness of the controlled group only, never absence of an
intentionally escaped process. Repository review and the frozen-source gate,
not PGID membership, own that executable-code trust decision.

## Composite state machine

```text
capture job
  idle
    -> source_binding -> source_bound
    -> tooling_preparing -> tooling_ready
    -> check_running -> check_executed
    -> evidence_persisting -> capture_completed
    -> evidence_validated
    -> evidence_uploading -> evidence_uploaded
    -> capture_passed | capture_failed
  any non-final state -> capture_infrastructure_failed

issue job (admitted only from capture_failed + trusted uploaded evidence)
  issue_pending
    -> issue_admitted
    -> evidence_downloading -> evidence_reverified
    -> labels_verifying -> labels_verified
    -> duplicate_querying
    -> duplicate_querying (next bounded page)
    -> duplicate_found -> issue_settled
    -> duplicate_absent -> issue_creating -> issue_created -> issue_settled
    -> issue_creating -> create_reconciling
    -> create_reconciling -> issue_created | issue_failed
  any non-final state -> issue_failed

conclusion job (always scheduled)
  external bootstrap (outside XState)
    -> CONCLUSION_ACTOR_STARTED -> conclusion_pending
         -> passed | failed_recorded | failed_unreported
    -> pre_actor_bootstrap_interrupted (job red, no terminal/no claim)
```

`capture_passed`, `capture_failed`, `capture_infrastructure_failed`,
`issue_settled` and `issue_failed` are final states of their child actors and
immutable job milestones, not workflow terminals. After
`CONCLUSION_ACTOR_STARTED`, the conclusion actor has the closed final set
`{passed, failed_recorded, failed_unreported}`. No fourth actor final, neutral
actor final, implicit success or terminal derived from job prose is permitted.
`failed_recorded` and `failed_unreported` both make the workflow conclusion
red. Before that event, checkout/setup/install/module-load/input-bootstrap
failure or interruption is the external operational observation
`pre_actor_bootstrap_interrupted`: GitHub marks the job/workflow red, the actor
start boundary is not authoritatively established, no XState terminal is
fabricated and no connector-health claim is made. The capture job may complete
successfully with disposition `failed`. That is not a green workflow because
the mandatory conclusion job either
deterministically fails after actor start or is already red before actor start.
`continue-on-error` is not used.

`pre_actor_bootstrap_interrupted` is an external observer classification, not
an XState state/event/final and not a job output that failed code is expected to
emit. It is established by a non-success/cancelled conclusion job with no
`CONCLUSION_ACTOR_STARTED` marker. Failed code cannot be required to emit a
fallback output, so only GitHub's red job result and no claim are authoritative.

## Executable XState v5 authority

Revision 6 must be implemented first as the committed
`scripts/connector-health/workflow-machine.ts` authority. It exports the typed
XState v5 actors `connectorHealthCaptureMachine`,
`connectorHealthIssueMachine` and `connectorHealthConclusionMachine`. Each is
created with `setup()` and declares exact context, input, output, event, guard,
action and invoked-actor schemas. The three actors implement the one composite
protocol above; their persisted names and final outputs are policy inputs.

The machine authority obeys all of the following:

- named guards are pure and delegate validation to pure deterministic
  functions; context changes only through immutable `assign()` actions;
- checkout, setup, child execution, persistence, artifact transfer and GitHub
  API requests are typed invoked actors. An invoked actor reports only a typed
  result event; it cannot select its successor or mutate machine context;
- invoked actors are bound to the lifecycle of their owning state. Leaving the
  state aborts the operation, closes its resources and waits for the bounded
  cleanup contract before another effect may start;
- the capture orchestrator, workflow job outputs, issue writer and committed
  conclusion CLI consume these actors. YAML `if`, shell status, action prose,
  an inline script and duplicated conditionals must not reimplement a business
  transition;
- the capture actor outputs exactly `captureTerminal`, `issueAdmission`,
  `disposition`, `failureFingerprint`, `evidenceFileSha256`, `artifactId` and
  `artifactArchiveSha256`. `issueAdmission` is `admitted` only from final
  `capture_failed`, otherwise `denied`;
- the workflow may use only the machine-derived equality
  `issueAdmission == 'admitted'` plus presence of the exact identity outputs to
  schedule `issue-writer`. The issue actor independently re-evaluates the same
  admission guard from reverified evidence and outputs `issueTerminal`;
- the conclusion CLI first completes an external bootstrap: exact source and
  toolchain are ready, the committed machine module is loaded, strict `needs`
  inputs are captured, the actor is created and started, and error/exit handlers
  are installed. Only then does it emit the auditable lifecycle marker
  `CONCLUSION_ACTOR_STARTED`. Failure or interruption before that marker is
  `pre_actor_bootstrap_interrupted`, outside the machine and outside its final
  set;
- after that marker, the conclusion CLI derives and sends exactly one typed
  conclusion event to the already-started actor from the captured strict
  `needs` results and machine-derived child terminals. Capture success with
  `capture_passed` and issue skipped maps to `passed`; capture success with
  `capture_failed`, issue success and `issue_settled` maps to `failed_recorded`;
  every other strict input combination maps to `failed_unreported`;
- actor snapshots never cross jobs. Capture state is held only in the capture
  controller; the issue actor initializes from the downloaded, strictly
  reverified evidence and captured identity outputs; the conclusion bootstrap
  creates a fresh actor from strict captured workflow inputs;
- every public event is validated by an exact runtime schema before
  `actor.send`. An unknown key, malformed payload, event disallowed by
  `actor.getSnapshot().can(event)`, missing guard input or unauthorized
  state/event pair is converted at that boundary to the one known
  `PROTOCOL_REJECTED` event. Every non-final state handles
  `PROTOCOL_REJECTED` by failing closed to its child failure milestone, or to
  `failed_unreported` in conclusion after `CONCLUSION_ACTOR_STARTED`. No
  business event is silently ignored; wildcard business transitions and free-
  text transition commands are forbidden.

The XState state/event rows in this model are the complete allowed transition
relation. A state/event pair absent from them is forbidden and must be rejected
before dispatch. XState's default ignored-event behavior is therefore never an
application outcome. The explicitly labelled external bootstrap row is an
observer classification and not part of that transition relation.

## Events and transitions

| Actor      | State                  | Event                           | Guard                                                                                                  | Next                   | Invoked effect / assignment                                           |
| ---------- | ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------- |
| capture    | `idle`                 | `TRIGGER_ACCEPTED`              | exact admitted schedule, or exact default-branch dispatch; event/ref/SHA/workflow identity is exact    | `source_binding`       | invoke exact checkout and local source-identity verifier              |
| capture    | `source_binding`       | `SOURCE_BOUND`                  | checkout HEAD equals `github.sha`; default-branch/ref/workflow identity and clean-worktree policy pass | `source_bound`         | retain immutable source identity                                      |
| capture    | `source_bound`         | `TOOLCHAIN_PREPARE`             | exact action pins, runner, permissions and toolchain declaration pass                                  | `tooling_preparing`    | invoke exact Node/pnpm setup and frozen install                       |
| capture    | `tooling_preparing`    | `TOOLCHAIN_READY`               | Node, pnpm, package-manager integrity, lockfile and resolved executable all reverify                   | `tooling_ready`        | retain immutable toolchain identity                                   |
| capture    | `tooling_ready`        | `CHECK_START`                   | registry and exact child command/environment policy pass; invocation count is zero                     | `check_running`        | invoke the fixture-only health child exactly once                     |
| capture    | `check_running`        | `CHECK_CLOSED`                  | root close and controlled Linux process-group quiescence are proved inside the cleanup deadline        | `check_executed`       | retain bounded close, signal, timeout, stdout and stderr observations |
| capture    | `check_executed`       | `CAPTURE_FINALIZE`              | close observation maps deterministically to one health observation                                     | `evidence_persisting`  | invoke strict evidence construction, atomic write and reread          |
| capture    | `evidence_persisting`  | `EVIDENCE_PERSISTED`            | one strict bounded envelope was atomically written and strictly reread                                 | `capture_completed`    | retain disposition, file digest and stable fingerprint                |
| capture    | `capture_completed`    | `EVIDENCE_ACCEPTED`             | envelope, source and report invariants pass, including exact registry semantics                        | `evidence_validated`   | assign validated immutable evidence identity                          |
| capture    | `evidence_validated`   | `UPLOAD_START`                  | exact regular evidence file and uploader policy inputs are present                                     | `evidence_uploading`   | invoke the exact pinned upload once                                   |
| capture    | `evidence_uploading`   | `UPLOAD_CONFIRMED`              | uploader confirms exact name/path, no overwrite, nonempty file, artifact ID and archive digest         | `evidence_uploaded`    | retain artifact ID and archive digest                                 |
| capture    | `evidence_uploaded`    | `PASS_CLASSIFIED`               | derived disposition is `passed` and fingerprint is null                                                | `capture_passed`       | output `issueAdmission:denied`                                        |
| capture    | `evidence_uploaded`    | `FAILURE_CLASSIFIED`            | derived disposition is `failed` and fingerprint is present                                             | `capture_failed`       | output `issueAdmission:admitted`                                      |
| issue      | `issue_pending`        | `ISSUE_JOB_ADMITTED`            | capture final is `capture_failed`; artifact, digest, fingerprint and current-run identities are exact  | `issue_admitted`       | retain immutable expected identity                                    |
| issue      | `issue_admitted`       | `DOWNLOAD_START`                | no API call occurred; exact artifact ID/name and current run are bound                                 | `evidence_downloading` | invoke exact pinned download by artifact ID                           |
| issue      | `evidence_downloading` | `DOWNLOADED_EVIDENCE_VERIFIED`  | file, self, archive and source/run identities all strictly reverify                                    | `evidence_reverified`  | retain immutable revalidated envelope                                 |
| issue      | `evidence_reverified`  | `LABEL_QUERY_START`             | token has exact permissions and shared monotonic deadline remains                                      | `labels_verifying`     | invoke exact read-only label requests                                 |
| issue      | `labels_verifying`     | `LABELS_VERIFIED`               | exact-case `connector-health` and `bug` labels both preexist                                           | `labels_verified`      | retain exact label identities                                         |
| issue      | `labels_verified`      | `DUPLICATE_QUERY_START`         | exact fixed first-page request is authorized and shared deadline remains                               | `duplicate_querying`   | invoke read-only page 1 request                                       |
| issue      | `duplicate_querying`   | `PAGE_WITHOUT_MATCH_AND_NEXT`   | valid page has no marker; exact next page strictly advances inside cap/deadline                        | `duplicate_querying`   | increment counter and invoke only that reconstructed request          |
| issue      | `duplicate_querying`   | `QUERY_EXHAUSTED_WITH_MATCH`    | one open non-PR issue has exact label and marker                                                       | `duplicate_found`      | retain issue identity; perform no write                               |
| issue      | `duplicate_querying`   | `QUERY_EXHAUSTED_WITHOUT_MATCH` | exhaustion is proved within policy and no exact marker exists                                          | `duplicate_absent`     | retain proof of absence                                               |
| issue      | `duplicate_found`      | `ISSUE_SETTLED`                 | retained issue identity is strict                                                                      | `issue_settled`        | output settled duplicate identity                                     |
| issue      | `duplicate_absent`     | `CREATE_REQUESTED`              | absence proof is current; POST count is zero; deadline and exact request pass                          | `issue_creating`       | invoke the one permitted issue-create POST                            |
| issue      | `issue_creating`       | `CREATE_CONFIRMED`              | the single POST returns one strict issue with exact labels and marker                                  | `issue_created`        | retain created issue identity                                         |
| issue      | `issue_creating`       | `CREATE_RESULT_AMBIGUOUS`       | the single POST was transmitted but result is not authoritative                                        | `create_reconciling`   | set POST count to one; invoke first read-only marker reconciliation   |
| issue      | `create_reconciling`   | `RECONCILIATION_RETRY`          | fewer than three requests; no marker; five-second cadence and shared deadline permit another read      | `create_reconciling`   | invoke next exact read-only marker query                              |
| issue      | `create_reconciling`   | `RECONCILIATION_MATCH_FOUND`    | one non-PR open issue contains the exact marker                                                        | `issue_created`        | retain reconciled issue identity                                      |
| issue      | `create_reconciling`   | `RECONCILIATION_UNRESOLVED`     | three queries exhausted, deadline expired or response remains ambiguous                                | `issue_failed`         | perform no further request or write                                   |
| issue      | `issue_created`        | `ISSUE_SETTLED`                 | identity is strict and POST count is exactly one                                                       | `issue_settled`        | output settled created identity                                       |
| conclusion | `conclusion_pending`   | `CONCLUDE_PASS`                 | `CONCLUSION_ACTOR_STARTED`; capture result success + `capture_passed`; issue result skipped            | `passed`               | exit zero                                                             |
| conclusion | `conclusion_pending`   | `CONCLUDE_RECORDED_FAILURE`     | `CONCLUSION_ACTOR_STARTED`; capture result success + `capture_failed`; issue success + `issue_settled` | `failed_recorded`      | exit nonzero                                                          |
| conclusion | `conclusion_pending`   | `CONCLUDE_UNREPORTED_FAILURE`   | `CONCLUSION_ACTOR_STARTED`; every other strict input combination                                       | `failed_unreported`    | exit nonzero                                                          |

### Failure, retry, permission and cancellation transitions

| Scope / state                                | Event                          | Required transition                                                                                                                          |
| -------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| any non-final capture state                  | `PROTOCOL_REJECTED`            | abort the owned effect, complete bounded process-group cleanup if started, then `capture_infrastructure_failed`                              |
| `source_binding`                             | `SOURCE_REJECTED`              | `capture_infrastructure_failed`; do not prepare tooling, run health or upload                                                                |
| `tooling_preparing`                          | `TOOLCHAIN_FAILED`             | `capture_infrastructure_failed`; do not run health or upload                                                                                 |
| `check_running`                              | `CHECK_INFRASTRUCTURE_FAILED`  | kill/quiesce the controlled process group, then `capture_infrastructure_failed`; do not persist or upload evidence                           |
| `check_running`                              | `CHECK_HEALTH_FAILED`          | only after root close plus group quiescence; `check_executed`, then produce the trusted failed envelope                                      |
| `evidence_persisting` / `capture_completed`  | `EVIDENCE_REJECTED`            | `capture_infrastructure_failed`; do not upload                                                                                               |
| `evidence_uploading`                         | `UPLOAD_FAILED`                | `capture_infrastructure_failed`; deny issue admission                                                                                        |
| any non-final issue state                    | `PROTOCOL_REJECTED`            | abort the owned read/request and transition to `issue_failed`; never retry a write                                                           |
| `issue_pending` / `issue_admitted`           | `ADMISSION_REJECTED`           | `issue_failed`; perform no token-dependent API call                                                                                          |
| `evidence_downloading`                       | `EVIDENCE_REJECTED`            | `issue_failed` before any label/list/create API call                                                                                         |
| `labels_verifying` / `duplicate_querying`    | `READ_RETRY_ALLOWED`           | stay in state and retry that logical read only under the exact three-attempt/120-second policy                                               |
| `labels_verifying` / `duplicate_querying`    | `READ_FAILED`                  | `issue_failed`; no create                                                                                                                    |
| `issue_creating`                             | `CREATE_REJECTED`              | `issue_failed` on definitive response; never retry POST                                                                                      |
| `issue_creating` / `create_reconciling`      | `PERMISSION_DENIED`            | `issue_failed`; no permission escalation, retry or second POST                                                                               |
| external conclusion bootstrap, before marker | bootstrap failure/interruption | classify externally as `pre_actor_bootstrap_interrupted`; GitHub red; no established actor boundary, XState terminal/output or health claim  |
| any non-final conclusion state after marker  | `PROTOCOL_REJECTED`            | `failed_unreported`, exit nonzero                                                                                                            |
| invoked actor in any non-final state         | `COOPERATIVE_CANCEL_REQUESTED` | abort its operation, perform bounded cleanup, then take that actor's failure transition; never relabel cancellation as pass/recorded failure |

Only read-only label, duplicate and reconciliation requests may retry. Each
logical read has at most three total attempts for 429, 5xx or a documented
secondary rate limit, uses a canonical integer `Retry-After` of 0..60 seconds
and shares one 120-second monotonic issue deadline. A request must not start if
its delay or bounded response window would cross the deadline; an in-flight
request is aborted when the deadline wins and no request may finish as an
accepted result afterward. The create POST is sent at most once and is never
retried. An ambiguous transmitted create permits exactly three read-only
reconciliation requests, five seconds apart within that same deadline.

Permission denial, missing output, malformed job result, source/toolchain/
spawn/stream/persistence/reread/upload failure, download/digest/source-identity
drift, label drift, pagination/API-shape drift and exhausted retry/deadline are
infrastructure failures and never a health pass. A trusted child nonzero exit,
allowlisted signal, timeout, stream overflow, nonempty stderr or invalid/failed
report is health data: after controlled process-group quiescence it produces a
failed evidence envelope and follows normal upload/issue handling.

An infrastructure failure before trusted evidence upload does not admit the
issue writer: there are no trusted cross-job bytes to report. The always-run
conclusion job still fails red. An issue API failure after trusted failure
classification also ends `failed_unreported` and red.

## Capture and evidence contract

The workflow invokes one committed capture orchestrator on Linux. That
orchestrator spawns the fixture health child exactly once, without a shell and
with `detached:true`. A returned positive child PID is the process-group ID
`pgid`. Under the admitted executable trust boundary, every process created by
the exact health/Vitest launcher must inherit that group. The committed health
entry and test runner do not request another session/group or daemonize. This is
a reviewed launcher contract, not proof against malicious executable code; an
intentional escape is outside scope and is neither simulated nor claimed as a
contained hostile case.

The orchestrator enforces a 900,000 ms monotonic health deadline and streams
stdout and stderr without unbounded allocation. Each stream retains and hashes
exactly its first at most 524,288 bytes. On the first byte beyond either cap,
health timeout, stream-I/O failure or cooperative actor cancellation, it starts
one 30,000 ms monotonic cleanup deadline and synchronously requests
`process.kill(-pgid, 'SIGKILL')`; killing only the root PID is forbidden. It
discards every later byte without counting, hashing or retaining it. A normal
root close is also followed by immediate group inspection; if any controlled
group member remains, that group receives `SIGKILL` and must empty
inside the same bounded cleanup contract.

Cleanup is proved only when both conditions hold before the deadline: the root
child emitted its one authoritative `close` event, and repeated exact Linux
`process.kill(-pgid, 0)` probes return `ESRCH`, proving that no group member
remains. `EPERM`, a successful probe, missing root close, kill/probe error or
deadline expiry is infrastructure failure. A clean exit racing a group-kill
request may retain its authoritative exit code, but never relaxes the empty-
group proof. Spawn failure before a positive PGID requires no group kill; after
a positive PGID exists, cleanup is mandatory on every exit path. No evidence
construction, persistence or upload may start until group quiescence is proved,
and no member of the controlled group may survive capture completion. `ESRCH`
does not prove that no process escaped before the probe; revision 6 makes no
such claim.

Spawn, stream-I/O, process-group cleanup or missing-close failure is
infrastructure failure. A started child that closes with any allowlisted Linux
signal, times out or overflows yields a health envelope only after complete
controlled-group quiescence.

The capture command is exact. Its executable is the no-follow real path of
`process.execPath`, which must be Node `v22.23.1` below the admitted
`RUNNER_TOOL_CACHE`. Its argv is exactly
`['--import', 'tsx', 'tests/health/run-health-checks.ts', '--json']`, with cwd
exactly `$GITHUB_WORKSPACE/apps/extension`. The child environment is created
from empty and has exactly `CI=true`, `HOME=<fresh no-symlink directory below
RUNNER_TEMP>`, `LANG=C`, `LC_ALL=C`, `TZ=UTC`, `NO_COLOR=1` and
`MISSIONPULSE_CONNECTOR_HEALTH_FIXTURE_ONLY=1`. It inherits no `PATH`, token,
cookie, proxy, credential, Node option, production endpoint or connector
session. The locked `tsx` loader and health entrypoint invoke test binaries by
captured Node executable/absolute module path without a shell or package-manager
subprocess.

The exact detached envelope is:

```ts
type Sha256 = string; // exactly 64 lower-case hexadecimal ASCII bytes
type GitObjectId = string; // exactly 40 or 64 lower-case hexadecimal ASCII bytes
type ConnectorHealthSignal =
  | 'SIGABRT'
  | 'SIGALRM'
  | 'SIGBUS'
  | 'SIGCHLD'
  | 'SIGCONT'
  | 'SIGFPE'
  | 'SIGHUP'
  | 'SIGILL'
  | 'SIGINT'
  | 'SIGIO'
  | 'SIGIOT'
  | 'SIGKILL'
  | 'SIGPIPE'
  | 'SIGPOLL'
  | 'SIGPROF'
  | 'SIGPWR'
  | 'SIGQUIT'
  | 'SIGSEGV'
  | 'SIGSTKFLT'
  | 'SIGSTOP'
  | 'SIGSYS'
  | 'SIGTERM'
  | 'SIGTRAP'
  | 'SIGTSTP'
  | 'SIGTTIN'
  | 'SIGTTOU'
  | 'SIGUNUSED'
  | 'SIGURG'
  | 'SIGUSR1'
  | 'SIGUSR2'
  | 'SIGVTALRM'
  | 'SIGWINCH'
  | 'SIGXCPU'
  | 'SIGXFSZ';
type ConnectorHealthParseStatus =
  'valid' | 'missing' | 'oversized' | 'malformed_json' | 'duplicate_json_key' | 'invalid_report';

type ConnectorHealthFailureCode =
  | 'child_exit_nonzero'
  | 'child_signalled'
  | 'child_timed_out'
  | 'stdout_overflow'
  | 'stderr_nonempty'
  | 'stderr_overflow'
  | 'report_missing'
  | 'report_oversized'
  | 'report_malformed_json'
  | 'report_duplicate_json_key'
  | 'report_invalid_schema'
  | 'report_declared_failure'
  | 'connector_check_failed'
  | 'parser_regression_failed';

interface ConnectorHealthEvidenceV1 {
  schema: 'missionpulse.connector-health-evidence';
  version: 1;
  evidenceSha256: Sha256;
  capturedAt: CanonicalUtcTimestamp;
  source: {
    repository: string;
    sourceCommit: GitObjectId;
    workflowPath: '.github/workflows/connector-health.yml';
    eventKind: 'schedule' | 'workflow_dispatch';
    ref: string;
    runId: string;
    runAttempt: number;
  };
  child: {
    exitCode: number | null;
    signal: ConnectorHealthSignal | null;
    timedOut: boolean;
    stdoutBytes: number;
    stdoutTruncated: boolean;
    stdoutSha256: Sha256;
    stderrBytes: number;
    stderrTruncated: boolean;
    stderrSha256: Sha256;
  };
  reportObservation: {
    parseStatus: ConnectorHealthParseStatus;
    reportBytes: number;
    reportSha256: Sha256 | null;
  };
  report: ConnectorHealthReportV1 | null;
  disposition: 'passed' | 'failed';
  failureCodes: readonly ConnectorHealthFailureCode[];
  failureFingerprint: Sha256 | null;
}
```

The envelope uses exact keys at every level. `source.repository`, `ref` and
fixed environment values are strict UTF-8 without NUL/CR/LF and are bounded to
256 bytes; `runId` is 1..32 ASCII digits; `runAttempt` is an integer 1..1,000;
`sourceCommit` is exactly 40 lower-case hex for SHA-1 or 64 for SHA-256.
`capturedAt` is parse-safe UTC, exactly 24 ASCII bytes and round-trips through
ISO millisecond formatting. Every `Sha256` value uses exactly 64 lower-case hex
ASCII bytes. Stream byte counts are safe integers from 0 through 524,288 and
their digest covers exactly that retained prefix. A truncation flag requires
its retained byte count to equal 524,288; no untruncated stream may exceed that
cap. An exit code is an integer 0..255. Exactly one of `exitCode` and `signal` is
non-null after a started child closes. `timedOut:true` means the deadline won and
the kill was attempted; either allowed close outcome remains valid. Any
non-null signal derives `child_signalled`; timeout and truncation derive their
own failure codes independently.

`reportObservation.parseStatus == 'valid'` iff `report` is non-null,
stdout is untruncated, `reportBytes == child.stdoutBytes` is 1..524,288 and
`reportSha256 == child.stdoutSha256`. For every status,
`reportBytes == child.stdoutBytes`. `missing` requires zero bytes and a null
digest. Every nonempty status requires
`reportSha256 == child.stdoutSha256`; `oversized` additionally requires
`stdoutTruncated:true`, while `malformed_json`, `duplicate_json_key` and
`invalid_report` require untruncated stdout. Every non-valid parse status
requires `report:null`, derives its exactly corresponding report failure code
and never makes the envelope invalid merely because the child report was
invalid. These mutually exclusive outcomes make malformed, duplicate-key,
missing, oversized and schema-invalid reports trusted health failures eligible
for evidence upload and issue admission.

`failureCodes` is the sorted unsigned-UTF-8 unique set deterministically derived
from child and report observations. A `passed` envelope has an empty set and
`failureFingerprint:null`. A `failed` envelope has a nonempty set and one exact
fingerprint. `disposition` is never trusted from the child.

The orchestrator atomically writes one
`output/connector-health/connector-health-evidence.v1.json` regular file and
rereads it through the same strict validator. A successful capture operation
exits zero for either health disposition; child failure is data in the envelope,
not shell control flow. Failure to spawn, bound, atomically persist or reread the
envelope is an infrastructure failure and exits nonzero. No
`continue-on-error`, shell redirection or second health invocation is allowed.

`ConnectorHealthEvidenceV1` is a detached strict JCS-compatible object with no
duplicate keys, accessors, custom prototype, holes, symbols, unknown fields,
non-finite numbers or unsafe integers. Complete bytes are at most 1,048,576.
Its `evidenceSha256` is SHA-256 of RFC 8785 JCS of the complete envelope with
only that field omitted. The on-disk file is exactly the UTF-8 JCS bytes of the
complete envelope, with no BOM or trailing byte.

## Exact report contract

Connector health coverage is independent from packaging. The health registry
must be nonempty and must equal the complete committed
`getAllConnectorsMeta()` catalog by exact ID/name, even when
`connectors.config.json`, `CONNECTORS_INCLUDE` or `CONNECTORS_EXCLUDE` excludes
a connector from a particular build. Build configuration controls manifest,
runtime registry and settings packaging only; it never silently removes health
coverage. Revision 6 therefore requires all six entries below, including Malt
even while the current default build excludes it:

| Connector ID  | Exact name    | Exact unit-test regular file               | Exact regression-fixture regular directory |
| ------------- | ------------- | ------------------------------------------ | ------------------------------------------ |
| `cherry-pick` | `Cherry Pick` | `tests/unit/connectors/cherrypick.test.ts` | `tests/fixtures/regression/cherry-pick`    |
| `collective`  | `Collective`  | `tests/unit/connectors/collective.test.ts` | `tests/fixtures/regression/collective`     |
| `free-work`   | `Free-Work`   | `tests/unit/connectors/freework.test.ts`   | `tests/fixtures/regression/free-work`      |
| `hiway`       | `Hiway`       | `tests/unit/connectors/hiway.test.ts`      | `tests/fixtures/regression/hiway`          |
| `lehibou`     | `LeHibou`     | `tests/unit/connectors/lehibou.test.ts`    | `tests/fixtures/regression/lehibou`        |
| `malt`        | `Malt`        | `tests/unit/connectors/malt.test.ts`       | `tests/fixtures/regression/malt`           |

Registry startup and the strict report validator independently reject an empty
registry, duplicate ID, duplicate name, unknown entry, missing catalog entry,
ID/name drift, unsorted result or path drift as infrastructure failure. Every
path is workspace-relative strict ASCII, no-follow, below the exact extension
root and must resolve to the declared regular type; symlinks and special files
are forbidden. Each fixture directory must contain at least one admitted
fixture and its exact golden output. Altering the full-catalog health policy
requires a new model revision and review; a build exclusion alone is never such
approval.

The nested report has exactly:

```ts
interface ConnectorHealthReportV1 {
  schema: 'missionpulse.connector-health-report';
  version: 1;
  generatedAt: CanonicalUtcTimestamp;
  status: 'pass' | 'fail';
  connectors: readonly {
    connectorId: string;
    name: string;
    status: 'pass' | 'fail';
    checks: readonly {
      id: 'unit-tests' | 'regression-fixtures';
      status: 'pass' | 'fail';
      code:
        | 'unit_tests_passed'
        | 'unit_tests_failed'
        | 'unit_test_file_missing'
        | 'regression_fixtures_present'
        | 'regression_fixture_directory_missing'
        | 'regression_fixture_set_empty';
      detail: string | null;
    }[];
  }[];
  regression: {
    id: 'parser-regression';
    status: 'pass' | 'fail';
    code: 'parser_regression_passed' | 'parser_regression_failed';
    detail: string | null;
  };
}
```

`connectors` is nonempty and equals the six-row full-catalog health registry
ID/name set exactly once, ordered by unsigned UTF-8 connector ID. Every
connector contains the two exact check IDs once, in the listed order. Connector
IDs are 1..64 lower-case ASCII bytes matching
`[a-z0-9]+(?:-[a-z0-9]+)*`; names are 1..128 strict UTF-8 bytes; details are
null or 1..2,048 strict UTF-8 bytes. Names/details exclude NUL/CR/LF, a
triple-backtick Markdown fence, `<!--` and `-->`. Every check status has exactly its
corresponding pass/fail code; a pass detail is null except
`regression_fixtures_present`, whose detail is the canonical decimal fixture
count. The canonical timestamp is exactly the parse-safe, ISO-round-tripped UTC
grammar used by the envelope.

A report is `pass` iff every connector check, every connector aggregate and
the regression result is `pass`, the child exited 0, no signal/timeout occurred,
stderr is empty and neither stream overflowed. Empty/missing/duplicate
connectors, a missing regression result, semantic disagreement, malformed JSON,
duplicate key, overflow, nonzero exit, signal, timeout or stderr derives
disposition `failed`; supplied root `status` is verified, never trusted.

## Evidence artifact

The artifact is named exactly `connector-health-report`, contains only the one
validated evidence file and uses the reviewed uploader with:

- `if-no-files-found: error`;
- `overwrite: false`;
- retention 14 days;
- exact literal path; no glob or directory upload.

Upload is mandatory for both valid `passed` and `failed` dispositions. Upload
failure is `failed_unreported`; the issue job is not attempted. The issue job
downloads the exact artifact ID/name from the capture outputs and permits no
fallback run/artifact.

The four distinct digests are never conflated:

- `evidence.evidenceSha256` is the self-digest over JCS with that field omitted;
- capture output `evidenceFileSha256` is SHA-256 of the complete exact on-disk
  JCS bytes and is recomputed over the downloaded file before any API call;
- upload output `artifactArchiveSha256` is the pinned uploader's
  `artifact-digest` for GitHub's artifact archive and is retained only as that
  archive identity; it is never compared to either evidence digest;
- download output `downloadedEvidenceFileSha256` is independently recomputed
  over the downloaded evidence file and must equal `evidenceFileSha256`.

The capture job exposes exactly `captureTerminal`, `issueAdmission`,
`disposition`, `failureFingerprint`, `evidenceFileSha256`, `artifactId` and
`artifactArchiveSha256`. The issue job receives strict expected values from the
current workflow environment:

```text
GITHUB_REPOSITORY
GITHUB_SHA
GITHUB_EVENT_NAME
GITHUB_REF
GITHUB_RUN_ID
GITHUB_RUN_ATTEMPT
```

Before the issue token is used for any label, list or create API call, committed
code revalidates the complete envelope, self-digest and file digest and requires
exact equality between those six current values and `source.repository`,
`sourceCommit`, `eventKind`, `ref`, `runId` and `runAttempt` respectively.
`GITHUB_EVENT_NAME` admits only `schedule` or `workflow_dispatch`; run ID and
attempt are parsed using the envelope's strict decimal grammars. It additionally
requires the fixed workflow path, exact current artifact ID/name, capture
archive digest, evidence-file digest, disposition and failure fingerprint.
Artifact download is scoped to the current `GITHUB_RUN_ID` and exact artifact
ID; no prior run, latest artifact, name-only fallback or caller-supplied run is
accepted. Any mismatch transitions `EVIDENCE_REJECTED` before a token-dependent
API request. These volatile run fields bind evidence to this execution but stay
excluded from the stable failure fingerprint.

## Stable issue correlation

The failure fingerprint is SHA-256 of JCS of a stable projection containing the
workflow path, repository, exact source commit, child outcome codes, sorted
failing connector/check IDs and stable failure codes. It excludes
`generatedAt`, `eventKind`, `ref`, `runId`, `runAttempt`, stdout/stderr text,
volatile error details and report byte digest. A rerun of the same source/
failure therefore has the same marker.

The issue body contains exactly one bounded marker:

```text
<!-- missionpulse-connector-health:<64 lower-case hex> -->
```

Workflow-level concurrency serializes scheduled and manual runs for the
repository with exact group
`connector-health-${{ github.repository }}` and `cancel-in-progress:false`, so
duplicate query and create cannot race another admitted connector-health
writer. GitHub Actions retains only one pending run and may cancel an older
pending run when a third arrives. Such a run is explicitly
`pre_admission_cancelled`: it never reaches `TRIGGER_ACCEPTED`, receives no
token-dependent effect and makes no health claim. A human cancellation, runner
loss, GitHub outage or forced termination after admission is
`externally_interrupted`; it is outside the cooperative state machine, may have
already completed a durable upload or single issue write, cannot be relabelled
green/red by local code and makes no terminal health claim. Subject only to the
runner continuing to execute the committed jobs and
`CONCLUSION_ACTOR_STARTED` occurring, every admitted cooperative run reaches
one of the three actor finals. A red `pre_actor_bootstrap_interrupted` run is
explicitly the non-terminal exception and makes no health claim. The title is
presentation only.

Duplicate detection lists only open issues, not pull requests, with the
exact-case `connector-health` label, `per_page=100`, at most 10 pages and at most
1,000 items. An item carrying a `pull_request` field is excluded. The first
request fixes owner, repository, endpoint, state, label, page 1 and page size.
Subsequent pagination extracts only a canonical integer `page` 2..10 from a
GitHub Link header whose HTTPS origin, owner, repository, endpoint and all other
filters exactly equal the first request; it never follows an opaque URL. Each
page must strictly advance. The final short page or exact absence of `next`
proves exhaustion. A next link at the cap, repeated page, foreign/mutated link,
truncated/ambiguous response or API shape drift fails closed and never
authorizes create.

The exact-case `connector-health` and `bug` labels must preexist; the workflow
does not create or rename labels. Missing labels are infrastructure failure.
Read-only label/list requests permit at most three total attempts on 429, 5xx
and documented secondary-rate-limit responses, honor a canonical integer
`Retry-After` of 0..60 seconds and remain inside one 120-second monotonic
deadline. The issue-create POST is permitted exactly once and is never retried.
A definitive valid response settles `issue_created`; a definitive 4xx fails.
After a timeout, connection loss, 429 or 5xx following transmission, the client
performs read-only reconciliation queries five seconds apart inside the same
deadline, stopping early only on an exact marker match. An unresolved result is
authoritative only after exactly three such reconciliation requests; inability
to complete all three inside the deadline is itself unresolved. A match settles
as created; no match or any ambiguity becomes `failed_unreported`. No path
sends a second POST.

Issue title/body are produced by committed code from bounded stable fields. Raw
report bytes, error details, stdout/stderr, control characters, Markdown supplied
by a connector, tokens, cookies and environment dumps are never copied into the
issue.

## Workflow authority and exact pins

The workflow has three jobs:

1. `health-capture`: `contents: read` only;
2. `issue-writer`: failure-only, `actions: read`, `contents: read`,
   `issues: write` only;
3. `conclusion`: always-run, `contents: read` only.

Top-level `permissions` is exactly `{}` and every job declares its complete
map. No implicit permission, `write-all`, OIDC, checks, pull-request, package,
deployment or security-event authority is admitted. Permission denial follows
the failure transitions above; the workflow never expands authority or retries
a denied write.

A passing run never schedules the issue-writer job and therefore never receives
an issue-write token. Every checkout uses the exact reviewed SHA, exact
`ref:${{ github.sha }}` and `persist-credentials:false`. `GITHUB_TOKEN` is
injected as a step environment value only into the admitted issue API actor in
issue-writer. It is absent from source verification, dependency install, the
health child and all conclusion steps. Checkout and the pinned artifact actions
receive only their exact action input/runtime authority; no credential is
persisted or copied into a child environment.

Both `schedule` and `workflow_dispatch` are admitted only when all source
identities are exact: `github.event.repository.full_name == github.repository`;
`github.event.repository.default_branch` is a strict branch name;
`github.ref_type == 'branch'`; `github.ref` equals
`refs/heads/<default_branch>`; `github.workflow_ref` equals
`<repository>/.github/workflows/connector-health.yml@<github.ref>`;
`github.workflow_sha == github.sha`; and checkout HEAD equals `github.sha`.
Any other ref or identity fails before install or health execution. The source
verifier is local and receives no token; it makes no repository or branch-
protection API request.

This workflow deliberately does not assert that the default branch is
protected: GitHub's branch-protection read is not authorized by this
`contents:read` token contract. Protection, required reviews and required
checks remain repository-administration controls verified out of band. The
runtime health claim proves only exact default-branch/ref/SHA/workflow identity,
and documentation must preserve that limitation without implying an admin-
credential check.

Every job runs exactly `ubuntu-24.04`. Every step has one unique stable ID.
`container`, `services`, matrices, job-level/reusable/local/Docker actions,
dynamic `uses`, secrets expressions and environment credentials are forbidden.
No production credential, browser profile, cookie, live endpoint or authenticated
connector session is available.

The only allowed remote action repository/subpath/SHA tuples are:

| Action                      | Reviewed SHA                               |
| --------------------------- | ------------------------------------------ |
| `actions/checkout`          | `de0fac2e4500dabe0009e67214ff5f5447ce83dd` |
| `pnpm/action-setup`         | `0e279bb959325dab635dd2c09392533439d90093` |
| `actions/setup-node`        | `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` |
| `actions/upload-artifact`   | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| `actions/download-artifact` | `70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3` |

An arbitrary SHA40, repository/subpath drift, mutable tag or extra action is
rejected. Node is exactly `22.23.1`; pnpm is exactly `10.32.1`; the root
`packageManager` identity including integrity is verified; install uses the
frozen lockfile. Uploader/downloader names, paths, no-overwrite behavior and
retention are exact policy inputs.

All three jobs check out the exact source, install pnpm/Node from the reviewed
actions, verify the root `packageManager` string including its integrity suffix,
and run the one root command `pnpm install --frozen-lockfile`. Each then invokes
its committed entrypoint through the locked project toolchain:

```text
pnpm --filter @pulse/extension exec tsx scripts/connector-health/capture.ts
pnpm --filter @pulse/extension exec tsx scripts/connector-health/issue-writer.ts
pnpm --filter @pulse/extension exec tsx scripts/connector-health/conclusion-cli.ts
```

Each entrypoint verifies its no-follow `process.execPath` is Node `v22.23.1`
under the admitted `RUNNER_TOOL_CACHE` before sending an event. The conclusion
job therefore does not use the runner's preinstalled Node, `node -e`, inline
JavaScript, shell conditionals, an uncommitted runner, or dynamically downloaded
code to decide status. Its CLI consumes `connectorHealthConclusionMachine` and
after `CONCLUSION_ACTOR_STARTED` is the sole owner of terminal selection and
exit code. In conclusion, failure/interruption of checkout, setup, package-
manager verification, frozen install, module/input bootstrap, actor creation/
start or handler installation before that marker is
`pre_actor_bootstrap_interrupted`: the job is red, no actor terminal is
authoritatively established and no health claim is emitted. Failure after the
marker is handled by the actor's closed transition relation and cannot produce
green unless it reaches `passed`.

## Permission and operator documentation

`.github/workflows/README.md` and `tests/health/README.md` are required policy
surfaces and must be checked against the machine/workflow by automated drift
tests. They state the exact top-level and per-job permissions above; they must
not claim that all jobs are read-only. They document that the local capture
verifier receives no token or branch-protection authority, the artifact actions
transfer the exact current-run evidence, and the issue actor alone receives
issue-write authority after admission. They also state that conclusion has
`contents:read` solely for exact checkout and receives no token environment.

The same documentation records exact action pins, Node/pnpm/package-manager
identity, frozen install and the three committed commands; schedule/manual
trigger restrictions; artifact name/path/retention; the three workflow
actor finals and red semantics after `CONCLUSION_ACTOR_STARTED`; and the red/
no-claim `pre_actor_bootstrap_interrupted` outcome before it. They state that
the gate checks exact default-branch/ref/SHA/workflow identity but cannot prove
branch protection with `contents:read`, so protection is an out-of-band admin
control. They also record the executable trust boundary and that PGID emptiness
proves only the controlled group, not containment of malicious committed code.
Fixture-only tests use no live network, browser session, production credential
or authenticated connector state. Documentation drift, omission or a broader
permission/token/security claim fails policy verification.

## Required verification

Every matrix row is mandatory. “Reject” means deterministic fail-closed behavior
before the next privileged effect; it never means a warning or snapshot update
without a transition.

| Axis                                  | Nominal proof                                                                                                       | Hostile / drift cases                                                                                                                                        | Required assertion                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Model freeze and approval             | reproduce the normalized pending SHA-256 from exact UTF-8/LF bytes after final Prettier and auto-audit              | BOM, CRLF, second hash occurrence, alternate placeholder, post-hash semantic edit, historical revision-4/revision-5 digest                                   | one reproducible hash equals the header; rev4/rev5 stay rejected; independent review approves these exact bytes             |
| XState v5 topology                    | instantiate all three actors from typed `setup()` schemas and reach each declared child/final after actor start     | missing/extra state, event, guard, effect or final; direct context mutation; actor snapshot crossing jobs; non-XState status decision                        | machine graph equals this model; after `CONCLUSION_ACTOR_STARTED` its final set is exactly the closed three-state set       |
| Transition protocol                   | model-based paths exercise every allowed transition, named guard outcome, invoked actor result and assignment       | unknown event/key, malformed payload, wrong-state event, false guard, wildcard, missing output, duplicate/free-text transition                               | boundary uses schema + `snapshot.can`; every invalid case sends `PROTOCOL_REJECTED` and takes the specified failure path    |
| Effect ownership                      | each invoked actor starts once on owning-state entry and closes before successor effect                             | repeated invocation, effect outside state, late success after abort/deadline, side effect choosing next state                                                | machine alone selects transition; abort/cleanup completes and late results are discarded                                    |
| Workflow topology and pins            | exact three jobs, runner, stable unique step IDs, `needs`, action tuples and critical action inputs                 | extra/missing job/action, arbitrary SHA40/tag, dynamic/local/reusable/Docker action, matrix, container, service, secret expression, input drift              | policy parser rejects workflow before execution                                                                             |
| Trigger and source binding            | schedule/manual dispatch bind exact repository/default branch/ref/event/SHA/workflow identity and clean checkout    | feature/tag/non-default ref, invalid default branch, repository/workflow-ref/workflow-SHA drift, HEAD/SHA mismatch, dirty worktree, attempted protection API | source verifier uses no token/API; no install/health effect starts; capture infrastructure failure is red                   |
| Permissions and token isolation       | top-level `{}`; exact three job maps; token environment appears only in the admitted issue actor                    | permission expansion/omission, source-verifier token/admin API, token in install/health/conclusion, persisted checkout credential, passing issue job         | denied/expanded policy fails; passing path never receives issue-write authority; protection remains out of band             |
| Exact toolchain and conclusion runner | every job proves Node `22.23.1`, pnpm `10.32.1`, package-manager integrity, frozen install and locked `tsx` command | runner-preinstalled Node, `node -e`, inline/shell decision, mutable/dynamic runner, wrong Node/pnpm, lock/package-manager drift                              | committed CLIs consume XState; no implicit runner can conclude green                                                        |
| Registry and catalog                  | nonempty, unique IDs/names, exact sorted six-row equality with `getAllConnectorsMeta()`, including Malt             | empty/duplicate/unknown/missing/Malt-less registry, name/path/type/symlink drift, build include/exclude changes                                              | registry startup and report validation fail as infrastructure; build config cannot reduce health coverage                   |
| Capture executable contract           | one exact no-follow Node executable, argv, cwd and empty-derived six-key fixture-only environment                   | second spawn, shell/package manager, PATH/token/proxy/cookie/options/endpoint inheritance, wrong argv/cwd/home/type, executable outside tool cache           | child count is one; violation is capture infrastructure failure                                                             |
| Executable trust boundary             | exact reviewed health/Vitest/test modules and frozen dependencies run; fixtures remain non-executable hostile data  | dynamic/unlisted test or executable path, launcher requesting another group/session, daemonization API introduced, claim of sandbox/hostile-code containment | policy/review rejects launcher drift; model explicitly makes no claim about malicious executable escape                     |
| Linux process group                   | root plus cooperative child/grandchild share positive PGID, close normally, then negative-PGID probe proves `ESRCH` | timeout, either overflow, stream error, cooperative cancel, controlled-group member after root exit, kill error, `EPERM`, probe alive                        | `SIGKILL` targets `-pgid`; root close + controlled-group `ESRCH` occur inside 30 seconds; no group member remains           |
| Capture race and stream bounds        | zero/nonzero exit and every allowlisted signal map with exact capped-prefix counts/hashes                           | timeout/clean-exit race, kill/close race, missing/multiple close, byte 524,288/524,289, post-cap flood, stderr content/overflow, unsafe exit/signal          | authoritative close retained only after quiescence; bytes after cap are neither counted nor hashed                          |
| Strict report semantics               | complete six-connector pass and each declared connector/regression failure map to derived aggregate/disposition     | empty/missing/duplicate/unsorted connector/check, missing regression, false root status, malformed/duplicate-key/oversized JSON, hostile control/Markdown    | supplied status never overrides derived result; invalid report becomes bounded trusted failure, never green                 |
| Evidence/JCS/fingerprint              | exact schema, canonical timestamp, safe values, sorted failure codes, self/file digests and stable projection       | unknown/missing/accessor/prototype/symbol/hole/nonfinite/unsafe value, duplicate key, BOM/trailing byte, digest confusion, volatile fingerprint input        | strict validator/JCS reject drift; identical stable source/failure yields identical marker                                  |
| Atomic persistence                    | temp regular file, flush/close/atomic rename, no-follow reread and exact final bytes                                | partial write, collision, symlink/special path, rename/reread/digest failure, preexisting target, second evidence file                                       | capture exits infrastructure-failed and upload is denied                                                                    |
| Artifact lifecycle                    | pass and health-fail each upload exactly one named file for 14 days; issue downloads exact current artifact ID      | missing/empty/extra/glob/directory file, overwrite, upload failure, ID/name/archive/file/self digest mismatch, fallback/prior/latest run download            | all four digest meanings stay distinct; mismatch precedes issue API and concludes unreported red                            |
| Current-run evidence binding          | repository/SHA/event/ref/run ID/run attempt/workflow path plus artifact identities equal current environment        | stale replay, other repo/ref/event/attempt/run/artifact, malformed decimal, caller-selected run, right digest with wrong source                              | `EVIDENCE_REJECTED` occurs before label/list/create API; volatile run fields do not alter stable fingerprint                |
| Issue rendering/correlation           | exact bounded marker, stable title/body fields and same-source rerun correlation                                    | same title/different marker, hostile report detail/Markdown/control, raw stdout/stderr, token/cookie/env dump, oversized content                             | only exact marker deduplicates; untrusted/raw data never enters issue                                                       |
| Labels, read retry and deadline       | exact-case labels and successful first-attempt reads inside one 120-second monotonic budget                         | missing/case drift, 403, permission denial, 429/secondary limit/5xx, invalid/negative/>60 `Retry-After`, fourth attempt, delayed/late result, API shape      | only admitted read failures retry at most three total attempts; deadline aborts; no create on unresolved read               |
| Duplicate pagination                  | open non-PR exact-label scan exhausts canonical increasing pages or finds marker                                    | PR item, 1,001st item, page 11, loop/repeat, opaque/foreign/mutated Link, missing/ambiguous truncation, same title/different marker                          | only proved bounded exhaustion authorizes create; every cursor/shape ambiguity fails closed                                 |
| Create and reconciliation             | proved absence sends one POST; strict 201 settles, or transmitted ambiguity reconciles by exact marker              | malformed 201, definitive 4xx, timeout/connection loss/429/5xx before/after transmission, second POST attempt, reconciliation mismatch/late deadline         | POST count never exceeds one; unresolved requires three five-second read queries or fails unreported                        |
| Conclusion pre-actor bootstrap        | exact checkout/setup/install/module/input/actor-start/handler sequence emits `CONCLUSION_ACTOR_STARTED` once        | any bootstrap failure/cancel/runner loss, missing marker, event sent before marker, fabricated XState final without the marker                               | `pre_actor_bootstrap_interrupted` is red/no claim and outside the XState final set                                          |
| Conclusion actor Cartesian matrix     | after marker, exact pass tuple exits 0; exact failed+settled tuple exits nonzero recorded                           | every capture result/final/disposition mismatch, skipped/failed/cancelled issue, missing/malformed output, unexpected result string                          | exhaustive property test maps every non-nominal post-start tuple to nonzero `failed_unreported`                             |
| Cancellation semantics                | pending concurrency cancellation has no admission/effect; cooperative cancel aborts owned actor and cleans up       | external human cancel, runner loss, GitHub outage, pre-actor or post-start cancel, cancel during health/read/create/reconciliation, late callback            | no cancelled path is relabelled pass/recorded; pre-actor interruption/external interruption fabricates no XState final      |
| End-to-end outcomes                   | post-start fixture pass skips writer and is green; trusted health fail uploads, settles duplicate/create and is red | capture/upload/evidence/API ambiguity, admitted infrastructure failure, conclusion bootstrap failure                                                         | after actor start cooperative runs reach one closed final; before it bootstrap failure is red/no claim; nothing fails green |
| Documentation consistency             | both READMEs exactly describe permissions, token placement, identity gate/limits, trust boundary, bootstrap/finals  | “all read-only”, protection-verified or descendant-contained claim, token/toolchain/action drift, omitted no-claim bootstrap, live-session implication       | documentation-policy tests fail on any mismatch                                                                             |

Implementation remains forbidden until an independent reviewer reproduces the
final hash and approves this exact revision. After approval, implementation
starts with RED machine-contract, policy and negative/drift tests for every row;
no malicious `setsid`/daemon escape test is claimed inside the reduced trust
boundary. Only then may workflow/orchestrator/issue/conclusion code be changed,
followed by full verification and a second model-drift audit.
