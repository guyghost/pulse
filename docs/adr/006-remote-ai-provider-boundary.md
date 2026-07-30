# ADR-006: Remote AI Provider Boundary

## Status

Accepted for an internal pilot. Public activation remains blocked until the
retention and deletion controls have been verified.

## Context

MissionPulse is local-first: connector sessions, raw HTML, normalized missions,
the complete CV and deterministic scoring stay in the extension. Premium
Copilot needs durable agent sessions, server-authoritative entitlements and an
idempotent credit ledger. Calling a hosted agent from the Chrome extension
would expose provider authority and would let a locally mutable Premium flag
protect a paid service.

The landing application already owns Supabase authentication, subscriptions,
credits and server routes. Vercel Eve is useful for durable Copilot sessions but
is currently a beta dependency with a Node 24 runtime requirement. It must not
become an application-state authority or an irreplaceable domain dependency.

## Decision

Premium Copilot uses this trust boundary:

```text
Side panel -> typed bridge -> MV3 service worker -> MissionPulse API
  -> server auth, ownership, entitlement and credit admission
  -> provider port -> Eve
```

- The extension never calls an Eve route and never receives an Eve credential,
  session ID or continuation token.
- Account linking uses a browser auth flow. The short-lived extension bearer is
  kept in `chrome.storage.session`; the API revalidates subscription state for
  every privileged request.
- The service worker, not the UI, reads local mission/profile records and builds
  the allowlisted payload described by `@pulse/domain`.
- Only individually consented normalized mission fields, profile fields and
  selected experience evidence may cross the boundary. Cookies, connector
  sessions, raw HTML and the complete CV are forbidden.
- The API owns one durable dossier per user and mission and idempotent jobs per
  user request. Eve session handles remain server-side and are protected by the
  dossier owner ACL.
- Analysis costs zero credits for an active Premium entitlement. Each pitch,
  recruiter message, CV summary or TJM brief costs exactly one reserved credit.
  Reservation and refund are ledger operations keyed by the job idempotency key.
- Provider output is schema-validated and experience claims must reference
  supplied evidence IDs. It enters a human review state as a proposal. Only a
  correlated user event can approve, reject or copy it; no provider output can
  change an application stage.
- Eve is behind a replaceable `CopilotProvider` port. Its default shell, file,
  web and delegation tools are disabled because V1 requires no agent tool.
- The Eve runtime is isolated to the landing application on Node 24. The
  extension and the root release toolchain remain pinned to Node 22.
- Both an extension rollout flag and server configuration must be enabled. The
  default is unavailable, never implicitly free.
- Browser identity stays on `missionpulse.app`; bearer API traffic uses the
  cookieless `copilot.missionpulse.app` origin with `credentials: omit`. Eve is
  a private sibling service reached only by the server through Vercel OIDC.
- Internal-pilot admission is capped atomically per user and UTC day (10
  analyses, 20 jobs total) before credit reservation or Eve dispatch.
- A provider session continues only after explicit acceptance. Unknown
  post-dispatch outcomes remain `uncertain`; the absence of an Eve lookup or
  deletion API is never translated into success.
- Provider-session persistence and the job's known-disposition proof are one
  service-role transaction. The database additionally binds a session's active
  job through the composite `jobId + userId + dossierId` key.
- No-credit terminalization is one transaction across the job and dossier.
  Admission refusal before reservation, free provider/schema failure, free
  cancellation and terminal healing cannot expose a terminal job beside a
  stale `processing` dossier (or the inverse) after a lost response.
- The dossier row is the serialization fence and stores its active job ID.
  Every stage/review/refund/terminal RPC matches this ID before clearing it;
  stale retries cannot settle a newer job. Existing session rows are likewise
  non-rebindable outside the explicit accepted-continuation claim.
- Eve deletion uses a durable per-session disposition journal. A `pending`
  obligation is changed to `uncertain` before the remote call, then to
  `deleted` or `retention-confirmed` only after the result is durably recorded.
  Confirmed entries are never replayed, and uncertain entries fail closed until
  Eve lookup or operator reconciliation is available. Unknown provider
  disposition is checked before any remote deletion side effect.
- Local dossier deletion is a single RPC that both writes payload-free
  idempotency receipts (retained for 90 days) and deletes exactly one frozen
  dossier. Those receipts and the UTC-day admission ledger are not children of
  the dossier, so deletion cannot re-enable a paid replay or reset pilot quota.
- Receipt retention is physically enforced. A bounded service-role-only purge
  deletes rows whose database expiry has passed; replay/admission calls purge a
  batch opportunistically and an authenticated Vercel Cron drains expired
  batches every day. The operational target is deletion within 25 hours after
  expiry (daily schedule plus Vercel's documented timing window). A missed run
  must alert operators, and no stronger public retention SLA is claimed until
  that alert is deployed and exercised.
- Consent expansion validates the cumulative post-lock union and its collection
  limits before writing it. Rejected or concurrent expansions cannot persist an
  oversized consent set.
- Idempotency binds the key to input hash, dossier and operation kind. Routes
  parse and verify the input hash before canonical duplicate lookup. Every
  endpoint that may resume provider or billing work revalidates rollout and
  active Premium entitlement; auth-only cancel/delete paths do no new work.
- Settlement RPCs acquire the dossier serialization row before the correlated
  job row. Durable `cancelling` checkpoints are explicitly resumable; recovery
  never relies on a generic dossier repair or an uncorrelated replay.

The authoritative behavior is defined by:

- `premium-entitlement-sync.machine.ts`
- `remote-copilot-job.machine.ts`
- `copilot-dossier.machine.ts`

## Consequences

- **Positive**: Provider credentials, subscription authority and billing stay
  outside the extension.
- **Positive**: Local scan, scoring and Gemini Nano behavior remain available
  without an account or cloud transfer.
- **Positive**: A provider replacement does not alter domain transitions or the
  public extension API.
- **Positive**: MV3 restarts recover from durable job handles and idempotency
  keys instead of repeating paid work.
- **Negative**: Premium Copilot introduces a cloud data processor and therefore
  explicit consent, deletion, isolation and operational monitoring duties.
- **Negative**: Eve's beta and Node 24 requirements add a separate compatibility
  and deployment gate.
- **Negative**: Losing the session-only bearer requires relinking, by design.

## Production Gates

1. Verify and publish the effective Eve session retention and deletion policy.
2. Prove cross-user dossier isolation and exactly-once reserve/refund behavior
   against a real Supabase database.
3. Pass adversarial mission-description tests and synthetic two-user E2E tests.
4. Establish latency and cost budgets before enabling the public rollout flag.
5. Reconcile public pricing copy in a separate product change.
6. Configure `CRON_SECRET`, observe the receipt-purge cron in production and
   alert if no successful run is recorded within 25 hours.
