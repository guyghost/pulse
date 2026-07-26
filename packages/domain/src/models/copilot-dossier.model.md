# Copilot Dossier Model

## Purpose

Represent the user-controlled lifecycle of one Premium dossier per mission.
The dossier stores consent, durable Eve handles, validated analysis and
explicitly reviewed artifacts. It is not the application pipeline.

## States

```text
empty -- CONSENT_STARTED --> consenting
consenting -- CONSENT_CONFIRMED --> ready
consenting -- CONSENT_CANCELLED --> empty
ready -- CONSENT_UPDATED (monotonic expansion) --> ready
ready -- ANALYSIS_REQUESTED --> processing
processing -- JOB_REVIEW_READY --> reviewing
processing -- JOB_FAILED --> ready
reviewing -- ANALYSIS_APPROVED --> ready
reviewing -- ANALYSIS_REJECTED --> ready
reviewing -- ARTIFACT_APPROVED --> ready
reviewing -- ARTIFACT_REJECTED --> ready
ready -- DELETE_REQUESTED --> deleting
deleting -- DELETE_CONFIRMED --> deleted
deleting -- DELETE_FAILED --> deletionFailed
deletionFailed -- DELETE_RETRIED --> deleting
```

Follow-up generation starts from `ready` and may reuse only the Eve session
whose previous result the user explicitly accepted. The continuation is
atomically consumed before dispatch. Failure, invalid output or rejection
retires it; every known handle remains a deletion obligation.

Retry after failure is the same explicit `ready -> processing` admission as any
other generation. It requires fresh consent confirmation and a new job identity;
the failed job and its settled reservation are never reopened.

## Consented Data

- Mission: title, description, client, stack, location, remote mode, duration,
  start date and displayed TJM, each individually consented.
- Profile: job title, seniority, location, keywords/stack, TJM bounds and only
  explicitly selected experience evidence.
- Never: cookies, platform sessions, raw HTML, hidden page data or full CV.

## Public read projection

The authenticated owner may read a side-effect-free dossier projection even
when Premium has expired, access was revoked or the rollout was withdrawn.
This recovery read never resumes reservation, provider, refund or review work.
It contains only:

- `missionId` and the bounded dossier state;
- the cumulative consent identifiers needed to validate approved analysis
  evidence references;
- the explicitly approved analysis, if any;
- explicitly approved artifact drafts and their bounded kind/timestamps;
- the active job correlation (`jobId`, kind and state), if one exists.

It never contains input payloads, unapproved results, provider/session handles,
continuation tokens, deletion internals or free-form technical errors. Approved
content remains visible across later jobs and panel/browser restarts until
confirmed dossier deletion. The projection is observational and cannot itself
authorize cancellation, review, deletion or a pipeline transition.

## Invariants

1. No remote job starts before `CONSENT_CONFIRMED`.
2. Transmitted fields are a subset of both the allowlist and the consent set.
   Consent may expand only through an explicit event while `ready`; removals
   require confirmed deletion and a new dossier. Each job persists the exact
   consent snapshot used to validate its transmitted payload.
3. An experience claim must reference a supplied evidence identifier; absent
   evidence is rendered as a gap/question, never invented experience.
   Every generated artifact is an ordered list of grounded segments. A segment
   has non-empty typed source refs: `{kind:'experience', id}`,
   `{kind:'mission-field', id}`, `{kind:'profile-field', id}` or, for TJM only,
   `{kind:'tjm-fact', id}`. Every ref is bound to an allowlisted, consented
   source and an exact supporting excerpt. TJM refs are additionally restricted
   to canonical fact IDs derived from the validated deterministic fact object.
   Pitch, message and CV-summary artifacts must reference at least one selected
   experience overall. Providers cannot emit a separate free-form draft;
   MissionPulse assembles the copyable draft from validated segments only.
4. Eve handles and results are scoped to one `userId + missionId` dossier.
   At most one handle is continuation-eligible, and only after acceptance.
5. Only schema-valid results enter `reviewing`.
6. Only explicit user events add an approved artifact.
7. Deletion is forbidden while a job is processing or awaiting review. The job
   must first settle back to `ready`, so no reservation or provider disposition
   can be erased by a cascade.
8. Deletion is terminal only after both MissionPulse records and configured Eve
   session deletion/retention obligations are confirmed.
9. Dossier events never directly change `MissionTracking.currentStatus`.
10. `JOB_FAILED`/free cancellation is projected atomically with the matching
    job terminal state. The dossier cannot become `ready` before the job is
    terminal, and a terminal no-credit job cannot leave the dossier stuck in
    `processing` after a lost response.
11. Every retained Eve handle has an atomic per-job disposition proof. Its
    active job is constrained by the same `userId + dossierId`; deletion never
    infers proof from a handle currently rebound to another job.
12. Persistence mirrors `activeJob.jobId` on the dossier. Entering
    `processing` sets it; `reviewing` retains it; only the matching review,
    refund or no-credit terminal transaction clears it while returning
    `ready`. All ready/deleting states require it to be null.
13. Consent expansion validates the cumulative post-union selection, including
    every collection bound. A rejected expansion leaves both the persisted
    consent and the modeled context unchanged; concurrent expansions serialize
    on the dossier row and cannot jointly exceed a bound.
14. Every Eve session carries a durable deletion disposition:
    `pending | uncertain | deleted | retention-confirmed`. Deletion first
    proves that every dispatched job has a known handle, then atomically claims
    one `pending` obligation as `uncertain` before invoking Eve. A confirmed
    disposition is never replayed. `uncertain` requires provider lookup or
    operator reconciliation and is never retried as a blind delete.
    Recovery may rehydrate a durable `deleting` dossier after process loss and
    continue only obligations still marked `pending`.
15. Local deletion commits only after all session dispositions are confirmed.
    It atomically creates payload-free idempotency receipts for every removed
    job and deletes exactly one `deleting` dossier. A zero-row delete or any
    persistence failure after an Eve effect transitions the surviving dossier
    to `deletionFailed`; the API never reports `deleted` without that commit.
16. Daily pilot admission is counted in a user/day ledger that does not cascade
    with dossiers. Deleting a dossier cannot restore quota. Idempotent retries
    and durable deleted-job receipts are checked before the ledger increments.
17. Deleted-job receipts contain no dossier payload and expire after 90 days.
    Expiry is enforced by physical deletion, not only by query filtering: a
    service-role-only bounded purge runs opportunistically on replay/admission
    and is drained by an authenticated daily maintenance task. The operational
    deletion target is within 25 hours after expiry and must be monitored before
    any public retention guarantee is published.
18. The owner-only public read projection is side-effect-free and remains
    available for recovery without active Premium. It includes every approved
    analysis/artifact, not merely the latest job checkpoint, and exposes no Eve
    handle or unapproved generated content.
19. A retryable failure is terminal for its job. A user retry creates a new job
    with new attempt, idempotency and billing identities, and may consume a new
    credit. Canonical transport replay of the old job remains idempotent and is
    never presented as a fresh generation.
20. Copilot tables and service-role RPCs are not a browser API: `anon` and
    `authenticated` have no direct table privileges. The owner-only public
    projection is served exclusively by the MissionPulse API after bearer
    verification and an explicit `userId + missionId` repository lookup.
21. A dossier retains at most 512 approved artifacts. Admission rejects a new
    artifact job before quota, credit or provider effects when that bound is
    reached; analysis remains available. The machine, database constraint and
    public projection enforce the same bound, so reopening never truncates
    previously approved content silently.

## Review Coverage

- Consent confirmation/cancellation, monotonic expansion, forbidden removal,
  and forbidden updates while processing/reviewing.
- Malicious mission instructions, oversized descriptions and unknown fields.
- Valid analysis, invalid/fabricated evidence references and provider failure.
- Artifact segments with missing, mixed, unknown or fabricated source refs.
- TJM facts, inferred anchor and recommendations rendered as distinct layers.
- User approve/reject, multiple drafts and reopening after panel/worker restart.
- Delete failure/retry and user/session isolation.
- Partial Eve deletion, unknown preflight disposition, confirmed-session retry
  suppression, local zero-row deletion and durable deleted-job replay denial.
- Sequential and concurrent consent unions at the maximum collection bounds.
- Dossier deletion followed by same-day quota and idempotency retries.
- Retryable failure followed by a fresh consented job; the old refunded billing
  identity cannot fund the new provider run.
- Direct anon/authenticated table reads and writes are denied even when a caller
  guesses a valid dossier or job identifier.
- Artifact admission at 511/512 retained items and a malformed persisted array
  above the bound.
- Receipt expiry followed by physical row deletion through both opportunistic
  and scheduled maintenance paths.
- Approved analysis plus multiple approved drafts survive a later job and a
  side-panel/browser restart through the owner-only dossier projection.
