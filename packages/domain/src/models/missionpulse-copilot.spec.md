# Spec: MissionPulse Copilot Premium

## Objective

Build an opt-in Premium copilot for French freelance applications. The first
vertical slice produces a durable, reviewable application dossier for one
normalized mission and can prepare a pitch, recruiter message, CV summary or
TJM negotiation brief.

The free extension remains local-first. Scraping, deterministic scoring and
Gemini Nano are not replaced. The cloud receives only the fields explicitly
selected by the user. An LLM may return structured signals or draft content;
it never grants Premium, consumes credits, approves an artifact or changes an
application status.

The product plan was approved by the user on 2026-07-21. This document records
the implementation assumptions that make the approved plan executable:

1. The Eve-backed path is disabled by default and is an internal pilot until
   retention/deletion and authorization controls have been verified.
2. The initial extension session is linked through a browser auth flow. Its
   bearer is kept in `chrome.storage.session`, never durable local storage.
3. The API revalidates the user, Premium entitlement, request ownership and
   credit balance on every privileged request. A cached extension snapshot is
   display-only.
4. Analysis is included in Premium. Each requested draft or TJM brief consumes
   exactly one credit.
5. V1 is propose-and-confirm only. It never sends a message, edits a CV,
   changes a pipeline status or schedules an external action.
6. Generated artifacts are ordered `draftSegments`; each segment carries one
   or more typed `sourceRefs`. Experience refs resolve only to explicitly
   selected evidence. TJM refs resolve only to canonical deterministic local
   fact IDs. There is no independent free-form draft accepted from a provider.
7. The server assembles copyable text from validated segments. The provider
   contract contains no free-form summary; factual claims, gaps, risks,
   questions, facts, inferences and recommendations remain distinct projections.
8. Dossier consent is a monotonic cumulative union. A user may explicitly
   expand it only while the dossier is ready, while every job stores and
   validates the exact subset selected for that operation. Historical consent
   never authorizes transmission of a field omitted from the current job.
   Removing cumulative consent requires confirmed dossier deletion.
9. The internal pilot admits at most 10 analysis jobs and 20 total jobs per
   user per UTC day. The admission slot is serialized per user and is consumed
   only by a newly persisted idempotency key; a canonical retry consumes no
   additional slot. Exceeding either bound returns `RATE_LIMITED` before any
   credit or provider effect.
10. An Eve session is eligible for continuation only after the user accepts
    its result. Claiming it for the next job atomically makes it ineligible;
    rejection, invalid output, cancellation or failure retires that context.

## Tech Stack

- Shared deterministic contracts and XState v5 machines: `@pulse/domain`.
- Chrome MV3 client: Svelte 5, bridge-only service-worker orchestration.
- MissionPulse API: SvelteKit on Vercel with Supabase auth/billing.
- Agent provider: Eve behind a replaceable server-only provider port.
- Runtime validation: Zod at every extension/API/provider boundary.

## Commands

- Shared models: `pnpm --filter @pulse/domain test && pnpm --filter @pulse/domain typecheck`
- Landing: `pnpm --filter @pulse/landing test && pnpm --filter @pulse/landing typecheck`
- Extension: `pnpm --filter @pulse/extension test && pnpm --filter @pulse/extension typecheck`
- Builds: `pnpm --filter @pulse/ui build && pnpm --filter @pulse/landing build && pnpm --filter @pulse/extension build`
- Formatting: `pnpm exec prettier --check <touched files>`
- Extension lint: `pnpm --filter @pulse/extension exec eslint <touched extension files>`

## Project Structure

- `packages/domain/src/models/`: authoritative state machines and contracts.
- `apps/landing/agent/`: Eve agent instructions, explicitly disabled built-in
  tools and structured output contract.
- `apps/landing/src/lib/server/copilot/`: auth, entitlement, orchestration,
  credit idempotency and provider port.
- `apps/landing/src/routes/api/copilot/`: extension-facing API only.
- `apps/extension/src/lib/core/copilot/`: pure consent and presentation logic.
- `apps/extension/src/lib/shell/copilot/`: session-only auth, API transport and
  durable local projection.
- `apps/extension/src/lib/shell/messaging/bridge.ts`: the only side-panel/SW
  boundary.
- `apps/extension/src/ui/`: review and consent UI; no business transitions.

## Code Style

The model decides; async shells only execute commands and return correlated
facts:

```ts
const decision = decideCopilotAdmission(snapshot, request);
if (decision.kind !== 'accepted') return decision;

const providerResult = await provider.run(decision.providerInput);
actor.send({ type: 'PROVIDER_COMPLETED', jobId: request.jobId, providerResult });
```

No free-form provider text is used as an event name, status or transition.

## Testing Strategy

- Model tests enumerate allowed and forbidden transitions, stale correlation,
  retry, cancellation, expiry, revocation and terminal states.
- Pure contract tests reject oversized/untrusted inputs and invented evidence.
- API tests cover unauthenticated, non-Premium, wrong-owner, insufficient
  credit, duplicate request, provider failure and exactly-once refund paths.
- Shell tests cover MV3 restart and session-token loss without granting access.
- E2E covers consent -> dossier -> draft -> review/copy -> reopen.
- Synthetic adversarial mission descriptions are treated as data and cannot
  change instructions or fabricate candidate experience.

## Boundaries

### Always

- Validate auth and ownership server-side.
- Expose no direct `anon` or `authenticated` table privilege for Copilot
  persistence. Browser/extension clients use only the owner-scoped MissionPulse
  API; service-role RPCs remain server-only and recheck `userId` correlations.
- Keep Eve and provider credentials server-only.
- Persist correlation/idempotency keys before paid provider work.
- Resume only pre-dispatch durable phases. Once provider dispatch may have
  happened, missing durable completion becomes `uncertain` and requires
  operator reconciliation; it is never blindly replayed or refunded.
- Label every inferred claim and tie experience claims to supplied evidence.
- Render the exact provenance of each artifact segment from typed source refs.
- Require an explicit user event to approve/copy or trigger any existing
  application transition.

### Ask first

- Publicly enabling the pilot.
- Changing pricing or monthly credit grants.
- Sending email/messages, writing CVs or adding third-party data sources.
- Expanding transmitted profile fields or retention.

### Never

- Send cookies, platform sessions, raw HTML or a complete CV to Eve.
- Let the extension's local Premium state authorize a paid request.
- Let an LLM consume/refund credits or mutate the application pipeline.
- Auto-send an application or follow-up.

## Success Criteria

1. The three authoritative machines compile and their transition suites pass.
2. An unlinked/free/expired/revoked client fails closed.
3. A Premium user can consent to fields, create/reopen one dossier per mission,
   run the included analysis and request one-credit drafts.
4. Provider output is schema-validated before it reaches review.
5. A duplicate job request cannot double-charge and a failed paid job refunds
   no more and no less than once.
6. Closing/reopening the panel restores the local dossier projection; an MV3
   worker restart resumes through persisted job/session handles.
7. The pilot remains disabled unless both the release flag and server
   configuration are present.
8. Duplicate recovery settles `reserving` and `refunding` through idempotent
   ledger RPCs, resumes `queued` only before provider dispatch, and freezes any
   possibly dispatched provider turn as `uncertain` when Eve cannot look it up.
9. A user retry after terminal failure creates a fresh job, attempt,
   idempotency key and billing key after consent is reconfirmed; it never
   reopens a refunded job.
10. Approved dossier history is returned completely up to its explicit
    512-artifact bound; the next artifact request is refused before billing or
    provider dispatch rather than truncating history.

## Open Production Gates

- Verify and publish Eve session retention/deletion behavior.
- Complete an authorization/isolation security review with two synthetic users.
- Reconcile public Premium price copy in a separate change.
- Define operational budgets for latency and cost before public rollout.
- Provision and verify the cookieless `copilot.missionpulse.app` API domain on
  the same Vercel project as the reviewed SvelteKit/Eve sibling topology.
