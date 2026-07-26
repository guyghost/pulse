# Packaged tab scenarios model

Status: **MODEL REVISION 11 — PENDING INDEPENDENT REVIEW; IMPLEMENTATION FORBIDDEN**.

Pending behavior SHA-256: `30b628046132da3222a7affb19044ed92d46ea71bf31192509f10a98e400ddb9`.

The normalized pending behavior hash is SHA-256 of the complete raw UTF-8/LF
bytes of this file after replacing only the value between backticks on the
`Pending behavior SHA-256` line with the literal
`__PENDING_BEHAVIOR_SHA256__`. The surrounding backticks, period and every
other byte remain unchanged. The input must already be UTF-8 without BOM and
use LF line endings; there is no additional whitespace, Unicode, Markdown or
JSON normalization.

Revision 1 was independently rejected at exact raw UTF-8/LF SHA-256
`92d62124130a2dc41a39288903cd2b8663f0daea958f8f2297dab10c4c1a05ed`.
Revision 2 was independently rejected at normalized UTF-8/LF behavior hash
`f01ad85c80e22e412080598c7bab66f97c3439e2f255994dc11b784bf137c541`:
its MV3 parent dependency still named the obsolete revision-19/20 lineage, and
its generic live-state failure rows also matched `failed_cleaning`, permitting
a cleanup failure, cancellation or timeout to allocate another cleanup effect.

Revision 3 preserved all five revision-1 corrections from revision 2: explicit
checkpoint capture/reassertion events and correlations; an explicit offline
child machine; the distinct immutable V2 inventory-blob and scenario-matrix
authorities; a fail-closed
MV3 parent dependency; and a closed CV expansion action behind a separately
reviewed accessible-anchor contract. It now binds that parent dependency only
to pending MV3 harness revision 26 and its normalized behavior hash
`da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`,
without treating that candidate hash as approval, implementation or
verification. It also removes `failed_cleaning` from every generic transition
and gives that state exactly two terminal exits. No approval transfers from
revision 1, revision 2 or any MV3 harness revision.

Revision 3 was independently rejected at normalized UTF-8/LF behavior hash
`e378d64435e7a3e255d6b8a744a43d1988b8b36da22ca190ccc44b4fc7dc097f`.
It still depended on rejected release-readiness clarification 5, represented
release approval and implementation through one ambiguous digest, and created
an implementation cycle: this child forbade RED tests until the parent was
verified while the parent required all four child scenarios to execute before
its own verification could finish. Revision 4 replaces that cycle with one
closed joint implementation phase followed by one atomic authority activation.
It consumes distinct review, implementation and verification receipts for
release-readiness clarification 7, MV3 harness revision 26 and this revision 4;
none of those receipt digests is edited into this source file. No approval
transfers from revision 3.

Revision 4 was independently rejected at normalized UTF-8/LF behavior hash
`24dd339609de659497eb6e958319fe244149184137360c2dc9ca464d049486b0`.
Its pre-activation sandbox consumed one already
`ReviewedImplementedVerifiedModelAuthorityV1` tuple even though that sandbox
was supposed to produce the evidence from which verification receipts were
issued. It also named no typed ordered review, implementation and verification
sets or their exact JCS digest preimages, and the shared Git/activation contract
proved only two model blobs rather than the six-model authority set. Revision 5
consumes review-only authority for implementation, review-plus-implementation
authority for verification, and the complete verified authority only after
evidence has been accepted and receipts have been issued. No approval transfers
from revision 4.

Revision 5 was independently rejected at normalized UTF-8/LF behavior hash
`2e8e56fd119d8fccf08f1463cc12aca7dd9ff21af3d18118212ccbad6d911cc5`.
It verified tracked bytes only before and after commands, so a child could
temporarily mutate or shadow a source/test/config/module byte, build `dist`, and
restore the original tree before recapture. Revision 6 requires every packaged
scenario command and descendant to execute with the complete Git source mount
and its parents OS-read-only, no mount capability, and writes limited to closed
separate output mounts that cannot shadow tracked authority. No approval
transfers from revision 5.

Revision 6 was withdrawn at normalized UTF-8/LF behavior hash
`9b73affd0e6096ec8b2b60a1e5cffaa93633c0a5fea4cbf4d2ba91ae2c56b044`.
Its six-slot authority still pinned the CV accessible-anchor model at obsolete
revision 1 while the reviewed behavior had advanced to revision 3, so the joint
activation could not prove the exact CV semantics exercised by checkpoint A3.
Revision 7 preserves the immutable-source boundary and requires CV revision 3
at its exact frozen behavior hash. It also closes the non-candidate `test:mv3`
diagnostic-upload projection so workflow inspection cannot confuse diagnostic
evidence with candidate transport. No approval transfers from revision 6.

Revision 7 was withdrawn at normalized UTF-8/LF behavior hash
`f5fc3235a2c73988f1bfcdb11247cba1deae7a33fc5d8e64e3440cff19930962`.
Its CV dependency pinned revision 3, which was rejected because callback
availability was absent from the decoder and save had neither a validated
payload nor an immutable form-to-draft merge rule. It also left the packaged
MissionCard, TJM-results and theme-control anchors as implementation-time
choices even though positional fallback is forbidden. Revision 8 binds the
corrected CV revision 4 at its exact frozen behavior hash and closes the three
packaged UI contracts: a non-interactive named mission article with an explicit
controlled disclosure; a named TJM region/list/item hierarchy; and a named
three-button theme group whose pressed state follows only confirmed settings.
It preserves revision 7's immutable-source and separately projected diagnostic
upload boundaries. No approval transfers from revision 7.

Revision 8 was withdrawn at normalized UTF-8/LF behavior hash
`4933b559dc9fca2977d7f3d7371eed69a4f72ca8f687979cb1ebee8716693155`.
Its CV dependency pinned revision 4, whose live machine had no transition rows
for stale, unknown or mismatched callback settlements: the only wildcard rows
were restricted to UI intents. A late or divergent callback result could
therefore remain outside the closed transition table. No approval transfers
from revision 8.

The first revision-9 candidate was withdrawn before independent review at
normalized UTF-8/LF behavior hash
`eaa67f36ff21210e7b4a0910d0556d5643bf0fd969091bf8a3191f88a7647c1e`.
It bound CV revision 5, whose provisional approval was revoked after the model's
focus-exit audit exposed a phantom `FOCUS_EXIT_REQUESTED` output with no explicit
Svelte callback port or unconditional terminal cleanup. That package candidate
therefore could not prove checkpoint A3 even though it had closed the
MissionCard, TJM and appearance anchors.

Revision 9 was independently rejected at normalized UTF-8/LF behavior hash
`9b910299cf2d77d277503610f4996a3465eb9a21d35a9d3cce296472f907238a`.
Its `dependency_admitting` state allocated `ADMIT_REQUIRED_AUTHORITIES` but had
no correlated transition for the closed `EFFECT_FAILED`, `TIMEOUT` or
`CANCELLED` transport events. An admission transport failure could therefore
leave a live state without a terminal path. Revision 10 adds exact current
admission-failure transitions directly to `failed`, before any browser exists
and without allocating cleanup. No approval transfers from revision 9.

This revision-10 candidate binds the independently approved CV
accessible-anchor revision 6 at normalized behavior hash
`d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98`.
Revision 6 preserves the exact packaged A3 article/toggle/region contract,
consumes every live callback settlement, exposes one decoded synchronous
`onFocusExitRequest` port and guarantees focus confinement, details-ID lease
release and terminal removal through nested `finally` effects. This revision
also retains revision 8's closed MissionCard, TJM-region and appearance-group
anchors, RED/proof obligations, immutable-source execution boundary and the
exact separately projected `diagnostic_only` MV3 uploader. The joint parent is
the forthcoming release-readiness clarification 11, which must freeze this
exact candidate hash before its own review. No approval transfers from revision
8, either revision-9 candidate or any CV predecessor.

Revision 10 was independently rejected at normalized UTF-8/LF behavior hash
`2c18f03f8ff287ae65c6142552af0b60d7707dae994bb337719553c1f12d0cc8`.
Although its dependency-admission transport paths were closed, the normative
required-identity tuple still required packaged-tabs `modelRevision = 9`, so
neither the revision-10 tuple nor the obsolete revision-9 tuple could satisfy
the authority decoder. Revision 11 preserves the revision-10 admission fix and
updates every current packaged-tabs identity, invariant, plan and activation
reference to revision 11. No approval transfers from revision 10; these exact
revision-11 bytes still require independent review.

No test, harness, UI, service-worker, storage, inventory or release-gate
implementation is authorized from this document until an independent reviewer
approves its exact bytes.

The only lawful lifecycle is
`Model -> Review -> Implement -> Verify -> Joint activation`. Review may admit
the bounded RED-first implementation phase; it cannot skip implementation
receipts, verification evidence, distinct verification receipts or the final
atomic activation. A prompt, green exit code, worktree diff or LLM statement is
not a lifecycle transition.

The author records the computed lowercase 64-hex candidate digest only on the
`Pending behavior SHA-256` line. The reviewer independently reproduces it
outside this file. Normalization restores the literal placeholder before
hashing, so that this one digest substitution does not change the reviewed
behavior bytes. Any other byte change invalidates approval and returns the
model to pending review. Model receipt digests are runtime activation authority,
not source placeholders; recording or replacing one inside this file is
forbidden and would require a new revision and review.

## Decision and objective

The production claim owned by this model is deliberately narrow:

> In a real Chromium/Chrome Manifest V3 process loading the exact sealed
> `apps/extension/dist` package, every one of the six navigation tabs can perform
> its representative user workflow, confirmed local state survives a warm page
> reload, onboarding completion survives a reload, and cached local workflows
> remain truthful through offline and recovery transitions.

The six tabs are `Feed`, `Profil`, `CV`, `Suivi` (the Candidatures page), `TJM`
and `Réglages`. Onboarding is a separate initial-route workflow, not a seventh
tab.

This model adds persistence and workflow proof to the existing render-only
coverage in `tests/e2e-extension/navigation.test.ts`. It does not claim that:

- a connector can log in to, scrape or mutate an external platform;
- an external application is submitted;
- CV sync, generated assets, Gemini Nano or notifications work;
- the dormant application-tracking wire v2 or Settings V2 cutover is live;
- selecting an onboarding source is currently durable;
- the service worker survives a process restart in these new scenarios. That
  separate claim remains owned by `runtime.service-worker-reload` and the MV3
  harness model.

The canonical command remains:

```text
pnpm --filter @pulse/extension test:mv3
```

The CI step may be followed by exactly one separately projected diagnostic
upload. Its closed contract is byte-for-byte:

```text
schema             = missionpulse.mv3-diagnostic-artifact-policy
version            = 1
purpose            = diagnostic_only
jobId              = test-mv3
job permissions    = { contents: read }
jobProjectionSha256 = SHA-256(JCS(complete exact committed test-mv3 job projection))
stepId             = upload-mv3-evidence
if                  = always()
uses                = actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
name                = missionpulse-mv3-evidence-${{ github.run_id }}-${{ github.run_attempt }}
path                = output/playwright/
if-no-files-found   = error
overwrite           = false
retention-days      = 14
candidateAuthority  = false
```

`jobProjectionSha256` is recomputed from the complete exact committed
`test-mv3` job projection above; it is never caller-supplied. The step is that
job's sole evidence publication and no other non-privileged job may upload an
artifact. `output/playwright/` contains bounded raw Playwright/runtime
diagnostics only. Neither its pathname, upload result nor receipt may enter the
thirteen-scenario verdict, the seven-component sealed candidate, privileged
command plan, candidate inventory, seal, attestation subject, transport digest,
catalog activation or any release transition preimage. It is never named
`missionpulse-sealed-candidate`, never carries `dist`, source, model, seal,
handoff or executable-controller bytes, and never sets `archive:false`.

The workflow policy decoder and inspector accept exactly that one SHA-pinned
projection and reject a missing/second uploader, another job permission, a
mutable/shortened pin, changed condition/name/path/error/overwrite/retention
input, an extra input, a candidate-shaped artifact, or any diagnostic receipt
presented as release authority. Missing diagnostic files fail the `test-mv3` CI
job because `if-no-files-found=error`; upload success or failure never changes a
candidate state. The current inspector's blanket rejection of this otherwise
exact uploader is an implementation blocker, not evidence that the diagnostic
step should be deleted, widened or relabeled.

## Authority and current release boundary

The implementation must follow the current runtime, not a reviewed future
target. The following sources are normative for this proof:

| Concern                                                           | Current authority used by these scenarios                                                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packaged process, sealed artifact, diagnostics and warm ownership | `src/models/mv3-packaged-harness.model.md`, `tests/e2e-extension/fixtures.ts`, `tests/mv3/harness/mv3-harness-controller.ts`                                                                                        |
| Six routes, labels and boot behavior                              | `src/models/app-shell.model.md`, `src/lib/state/app-navigation.svelte.ts`, `tests/e2e-extension/navigation.test.ts`                                                                                                 |
| Feed favorite and tracking UI                                     | `src/ui/pages/FeedPage.svelte`, `src/ui/molecules/MissionCard.svelte`, `src/lib/state/feed-page.svelte.ts`, `src/lib/state/tracking.svelte.ts`                                                                      |
| Profile lifecycle                                                 | `src/models/profile-state.model.md`, `src/ui/pages/ProfilePage.svelte`, `src/ui/organisms/ProfileSection.svelte`                                                                                                    |
| CV experience lifecycle                                           | `src/models/cv-experience-sync.model.md`, `src/ui/pages/CvPage.svelte`, `src/ui/organisms/ExperienceFeed.svelte`, `src/ui/molecules/ExperienceEditForm.svelte`                                                      |
| Candidature transition and details                                | Current Task 5 / wire v1 boundary in `src/models/application-tracking.model.md`, current bridge handlers in `src/background/index.ts`, `src/ui/pages/ApplicationsPage.svelte`                                       |
| TJM local analysis                                                | `src/lib/core/tjm-history/`, `src/lib/shell/storage/tjm-history.ts`, `src/ui/pages/TJMPage.svelte`, `src/ui/organisms/TJMDashboard.svelte`                                                                          |
| Settings mutation                                                 | Current release envelope in `src/lib/shell/settings-release/settings-release.contract.ts` and coordinator; `src/ui/pages/SettingsPage.svelte`                                                                       |
| Onboarding completion                                             | Current `src/ui/pages/OnboardingPage.svelte`, `src/ui/organisms/OnboardingWizard.svelte`, `src/lib/state/app-navigation.svelte.ts`; the unconnected target is documented in `src/models/onboarding-source.model.md` |
| Offline projection                                                | `src/models/app-shell.model.md`, `src/lib/state/connection.svelte.ts`, `src/lib/shell/utils/connection-monitor.ts`, `src/sidepanel/App.svelte`                                                                      |
| Persisted schemas                                                 | `src/lib/shell/storage/db.ts`, `src/lib/shell/storage/migration-registry.ts`, `src/lib/shell/storage/favorites.ts`, `src/lib/shell/storage/tracking.ts`                                                             |
| Existing committed scenarios                                      | `tests/mv3/scenarios.v1.json`                                                                                                                                                                                       |

The following distinctions are mandatory:

1. Application tracking uses the implemented wire v1. The proposed wire v2
   envelope, ledger, CAS, mutation revision and restart reconciliation are not
   required or asserted by these scenarios.
2. Settings proof uses the implemented
   `missionpulse_settings_release_v1` envelope and the public
   `GET_SETTINGS_RELEASE` / `MUTATE_SETTINGS_RELEASE` protocol. It does not claim
   the larger Settings V2 writer-fence cutover is complete.
3. TJM history is actually stored at `chrome.storage.local['tjm_history']` even
   though the storage module's introductory comment says IndexedDB. Tests follow
   runtime behavior, not that stale comment.
4. The production premium feature flag is dormant and the six tabs are
   unlocked. A `premium_enabled` seed is not authority and is not used.
5. `OnboardingWizard` currently advances after a source choice without
   persisting that source. The onboarding scenario proves profile, alert and
   completion persistence only. It must not manufacture a source-persistence
   claim.

## Blocking parent and UI authorities

Revision 11 is not standalone implementation, verification or release
authority. It consumes the clarification-11 parent-owned staged authority
contracts:

- `ReviewedModelAuthorityV1` carries only the exact model identity and review
  receipt digest;
- `ReviewedImplementedModelAuthorityV1` extends that exact value with one
  implementation receipt digest;
- `ReviewedImplementedVerifiedModelAuthorityV1` extends that exact value only
  after a verification receipt has been issued from accepted evidence; and
- the corresponding `OrderedReviewedModelAuthoritySetV1`,
  `OrderedReviewedImplementedModelAuthoritySetV1` and
  `OrderedReviewedImplementedVerifiedModelAuthoritySetV1` contain exactly six
  entries in the parent-defined order.

The complete verified tuple has exactly these fields:

```text
modelPath
modelRevision
behaviorSha256
reviewReceiptSha256
implementationReceiptSha256
verificationReceiptSha256
```

The three receipt bytes are independently loaded from the immutable review,
implementation and verification receipt stores. Their strict decoders require
the same path, revision and behavior hash; the implementation receipt also
binds one clean implementation commit/tree and implementation digest, and the
verification receipt binds that implementation receipt digest, one closed test
matrix digest and a passing result. A receipt digest is never a behavior digest,
one receipt cannot satisfy another role, and no tuple field may be inferred from
text, a test exit code, an environment variable or a model filename.

The exact required identities are:

```text
MV3 harness:
  modelPath = apps/extension/src/models/mv3-packaged-harness.model.md
  modelRevision = 26
  behaviorSha256 = da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b

Packaged tabs:
  modelPath = apps/extension/src/models/packaged-tab-scenarios.model.md
  modelRevision = 11
  behaviorSha256 = the independently recomputed value recorded on this file's
    Pending behavior SHA-256 line

Release readiness:
  modelPath = apps/extension/src/models/release-readiness.model.md
  modelRevision = 11
  behaviorSha256 = the independently recomputed value recorded on that file's
    Pending behavior SHA-256 line

CV accessible anchor:
  modelPath = apps/extension/src/models/cv-experience-card-accessibility.model.md
  modelRevision = 6
  behaviorSha256 = d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98
```

MV3 revision 26's known behavior digest identifies only the pending candidate;
it is not an approval, implementation or verification receipt. The release and
packaged-tab behavior values are likewise recomputed from the exact committed
model blobs rather than copied from a worktree or supplied by a caller. The
release dependency is admitted only when clarification 11 has independently
approved exact bytes and its exact implementation and verification receipts
prove the joint V2 implementation described below. The parent derives both the
inventory-blob and scenario-array digests from the committed Git blob. A child
model, worktree, environment variable or runtime report cannot mint or override
either value.

The CV dependency is admitted only after the exact model path, revision and
behavior hash named above independently authorize the accessible
experience-card anchor and expansion control, and matching implementation and
verification receipts prove that contract on the joint clean tree. The minimum
contract required by this scenario is:

```text
role=article, accessible name="Expérience Lead Packaged UI chez MissionPulse QA"
toggle accessible name="Afficher les détails de l’expérience Lead Packaged UI"
toggle aria-expanded=false -> true after one click
toggle aria-controls=<stable bounded details id>
controlled role=region, accessible name="Détails de l’expérience Lead Packaged UI"
```

The separate UI model may strengthen those semantics but may not replace them
with card index, DOM ancestry, CSS class, pixel position or visible-text
guessing. A worktree component or focused unit pass without the matching
implementation/verification receipts is not authority, so checkpoint A3
remains blocked until joint admission.

`DEPENDENCIES_ADMITTED` is a typed event, not a configuration boolean. Its
strict payload contains one `JointReleaseModelActivationV1` whose
`verifiedModelAuthoritySet` is the complete parent-owned ordered six-entry
verified set. The packaged scenario machine accepts it only when every receipt
independently validates, the set digest and every ordered projection validate,
every tuple matches the exact identity above, and the activation atomically
binds that same set to one source commit/tree, V2 inventory blob/array pair and
activated catalog revision. Missing, pending, stale, differently hashed,
cross-role or unverified authority produces `DEPENDENCY_ADMISSION_FAILED` and
no scenario effect.

Pre-activation joint verification uses a separate private
`VERIFICATION_DEPENDENCIES_ADMITTED` event carrying the parent-owned
`JointImplementationVerificationSandboxV1` capability **and** the exact
`OrderedReviewedImplementedModelAuthoritySetV1`. That set contains review and
implementation receipt digests only; a verification receipt digest in this
event is schema-invalid. The sandbox repeats its set digest, phase ID, frozen
commit/tree and inventory digests, but has `authorityMode:'verification_only'`,
no activation digest and no catalog write capability. Only the joint
verification facade can emit it. It permits the exact same scenario effects and
assertions so the reviewed implementation can be verified without circular
authority. Its successful terminal is `verified_only` and emits bounded
`JointModelVerificationEvidenceV1` for the packaged-tab slot. The parent
evidence-set builder validates that evidence before the independent verifier
issues a `ModelVerificationReceiptV1`; only then can the complete verified set
be constructed. Verification-only evidence can never satisfy a release
`PackagedMv3GateReceiptV1`, candidate, audit, seal or production
`DEPENDENCIES_ADMITTED` guard. After activation, release scenarios run again
under `authorityMode:'activated_release'`; verification-only evidence is not
promoted or re-labeled.

Both modes also require the parent-owned
`ImmutableGitSourceExecutionAuthorityV1`. Before any scenario child is spawned,
its Linux mount/capability receipt must prove:

- the complete committed Git tree is the backing source and the execution view
  is a recursive bind mount with `ro,nodev,nosuid,noexec`;
- the execution root, source mount and every source ancestor are read-only for
  the child and every descendant for their complete lifetime;
- the source view is not overlayfs and contains no bind/overlay mount on a
  tracked path or beneath any tracked source, model, module, test, fixture,
  harness, Playwright configuration, script, manifest, lock or config path;
- writable dependencies, caches, `dist`, browser profiles and reports are
  separate allowlisted mount roots. A mount inside the execution view is legal
  only at a fixed path proven absent from the Git tree, created empty by the
  controller, and still empty immediately before the separate output mount is
  attached;
- `CAP_SYS_ADMIN` and the complete capability bounding set are absent,
  `no_new_privs` is set, mount/remount/pivot/chroot namespace escape syscalls are
  denied and those restrictions are inherited by the complete process tree;
- Docker/containerd/buildkit/systemd sockets, FUSE, sudo/setuid/file-capability
  gain and every helper-mediated mutation broker are absent from scenario
  children;
- source-targeted write, chmod, link, symlink, rename, mount or remount attempts
  fail at the OS boundary before a byte changes; and
- every command has `cwd` in the read-only source view, names its writable
  outputs explicitly, and produces matching pre-exec/post-exit mount,
  capability, descriptor and process-tree receipts.

These are prevention guards, not before/after drift heuristics. Restoring bytes
after a transient mutation cannot satisfy them because the command never
receives a write or mount capability over source. `dist` evidence is invalid
unless its producing build receipt binds the same immutable-source authority and
closed output mount. Any overlay, tracked-path shadow, writable source ancestor,
unexpected mount, changed mount ID/flags, new namespace, escaping symlink or
receipt gap produces `DEPENDENCY_ADMISSION_FAILED` before browser launch.

## Packaged-only admission

Every scenario is admitted only after the exact independently approved,
implemented and verified MV3 harness revision 26/hash tuple named above has
proved all of the following:

1. the exact `dist` tree was sealed before browser launch;
2. `manifest.json` is MV3 and its packaged permission contract is valid;
3. a fresh temporary Chromium user-data directory and the packaged extension
   are running in one real persistent browser context;
4. the service worker identity belongs to the packaged extension;
5. page and worker diagnostics were installed before scenario effects;
6. no `src/dev`, Chrome stub, DevPanel, bridge logger, DEV global or DEV storage
   artifact is present;
7. no Vite server, application backend, mock server or external platform is
   started.

All scenario data is local. Tests never click an external mission URL. A
permission prompt, login wall, external page, backend request used as a fixture,
or DEV fallback is a terminal failure rather than a reason to weaken an
assertion.

## Proposed scenario inventory v2

A later jointly authorized parent/child implementation phase creates
`tests/mv3/scenarios.v2.json` and atomically switches every inventory consumer
from v1 to v2. The old v1 file must not remain the release authority after that
cutover.

The exact JCS/UTF-8 bytes of the proposed v2 inventory, with no BOM or trailing
LF, are:

```text
{"scenarioIds":["harness.bootstrap-diagnostics","harness.late-diagnostic","harness.page-console","harness.page-error","harness.worker-rejection","navigation.all-tabs","navigation.cold-onboarding","navigation.shortcuts-focus","packaged-tabs.applications-tjm-settings-persistence","packaged-tabs.feed-profile-cv-persistence","packaged-tabs.offline-recovery","packaged-tabs.onboarding-completion","runtime.service-worker-reload"],"schema":"missionpulse.packaged-mv3-scenario-inventory","version":2}
```

Two hashes bind different byte authorities and must never be conflated:

```text
inventoryBlobSha256 = b386a936abad72ccd4fe2b0dd5cdf2390a6762e3d2ce3e0b0e07635f16f6a1ef
scenarioMatrixSha256 = 2a9c9f67e0c19a0dae126f7db15c25a0c1411b0753e63ecad6eaa0824720f79a
```

`inventoryBlobSha256` is SHA-256 of the complete one-line JCS inventory object
above, including `schema`, `version` and `scenarioIds`.
`scenarioMatrixSha256` is SHA-256 of JCS of only the exact ordered
`scenarioIds` array, again with no BOM or trailing LF:

```text
["harness.bootstrap-diagnostics","harness.late-diagnostic","harness.page-console","harness.page-error","harness.worker-rejection","navigation.all-tabs","navigation.cold-onboarding","navigation.shortcuts-focus","packaged-tabs.applications-tjm-settings-persistence","packaged-tabs.feed-profile-cv-persistence","packaged-tabs.offline-recovery","packaged-tabs.onboarding-completion","runtime.service-worker-reload"]
```

The first digest proves the exact committed blob. The second proves the exact
scenario matrix expected and executed by the packaged gate. Equality between
the two is neither expected nor permitted as a shortcut.

In clarification 11, parent field `PACKAGED_MV3_SCENARIO_INVENTORY_V2.blobSha256`
and candidate `mv3ScenarioInventoryBlobSha256` map only to
`inventoryBlobSha256`. Parent `scenarioIdsSha256` and candidate
`expectedMv3ScenarioInventorySha256` map only to `scenarioMatrixSha256`. Those
aliases do not change the byte domain and cannot be cross-assigned.

`scenarioIds` is strictly increasing by ASCII byte order, contains no duplicate
and preserves every v1 scenario. Release validation must prove an exact
one-to-one mapping between this list and Playwright `scenario-id` annotations.
An absent, extra, duplicated, skipped or retried-under-another-ID scenario is a
release failure.

The inventory cutover is jointly owned with release-readiness clarification 11.
Neither model may require the other's completed implementation as a
precondition for beginning implementation. Instead, clarification 11 owns one
closed `JointReleaseModelImplementationV1` phase with these states and events:

```text
states:
  review_waiting -> implementing -> verification_pending -> evidence_frozen -> verified
  verified -> activated
  review_waiting | implementing | verification_pending | evidence_frozen | verified -> blocked

events:
  JOINT_IMPLEMENTATION_STARTED
  JOINT_IMPLEMENTATION_COMPLETED
  JOINT_VERIFICATION_EVIDENCE_FROZEN
  JOINT_VERIFICATION_PASSED
  JOINT_AUTHORITY_ACTIVATED
  JOINT_PHASE_FAILED
```

`JOINT_IMPLEMENTATION_STARTED` requires one valid
`OrderedReviewedModelAuthoritySetV1` containing approved review receipts for
exact release-readiness clarification 11, this packaged-tab revision 11, MV3 harness
revision 26, the CV accessible-anchor model and the aligned producer/consumer
satellite models. It allocates one phase ID and bounded implementation plan.
During `implementing` and `verification_pending`, the V2
inventory, scenario tests, harness, producer and release consumers may be
implemented and tested together, but they are candidate bytes only: no release
actor may consume them, the operative catalog remains on its pre-activation
authority, and no partial V2 consumer is authoritative.

`JOINT_IMPLEMENTATION_COMPLETED` freezes one clean commit/tree and one valid
`OrderedReviewedImplementedModelAuthoritySetV1` that is the exact ordered
extension of the review set. The private verification sandbox consumes that
implemented set and emits one ordered six-entry
`JointModelVerificationEvidenceSetV1`; it does not consume or manufacture a
verified set. The verifier validates each closed matrix against the same tree,
then issues six distinct verification receipts. `JOINT_VERIFICATION_PASSED`
accepts only the resulting
`OrderedReviewedImplementedVerifiedModelAuthoritySetV1` whose review and
implementation projection is byte-identical to the implemented set. Only
`JOINT_AUTHORITY_ACTIVATED` may then perform one
durable catalog CAS that records `JointReleaseModelActivationV1` and atomically
switches every inventory consumer from V1 to V2. A conflict, missing tuple,
partial cutover or any failure enters `blocked`; it publishes no activation and
cannot be repaired by editing receipt fields or reusing the phase ID.

The joint implementation and its atomic activation must ensure that actor
construction and sealing:

1. read only `apps/extension/tests/mv3/scenarios.v2.json` from the exact clean
   committed Git tree;
2. require the exact V2 schema and the raw blob digest
   `inventoryBlobSha256` above;
3. derive the ordered array from those bytes and require its JCS digest to equal
   `scenarioMatrixSha256` above;
4. copy that array byte-for-byte into candidate, raw-report and packaged-gate
   authority;
5. reject the V1 path, dual authority, worktree override, digest swap, missing
   annotation, reorder, duplicate, skip, retry or diagnostic;
6. bind the exact clarification-11 ordered six-entry verified authority set,
   including revision 11 and revision 26, plus the joint activation receipt into
   candidate, audit and gate
   authority.

Approval of either model alone does not authorize a cutover. Reviews authorize
only entry into the closed joint implementation phase; verified implementation
authorizes only the atomic activation attempt; only a committed activation
receipt admits a release candidate.

## Exact UI surfaces

The route proof reuses the current accessible surfaces instead of CSS position
or icon order:

| Tab          | Navigation button accessible name | Required page surface                      | Required heading                             |
| ------------ | --------------------------------- | ------------------------------------------ | -------------------------------------------- |
| Feed         | `Feed`                            | `feed-scroll-container` and `mission-feed` | `Radar freelance` or `Bonjour, ...`          |
| Profil       | `Profil`                          | `page-profile`                             | `Votre profil MissionPulse` or `Bonjour ...` |
| CV           | `CV`                              | `page-cv`                                  | `CV & expériences`                           |
| Candidatures | `Suivi`                           | `page-applications`                        | `Candidatures`                               |
| TJM          | `TJM`                             | `page-tjm`                                 | `Analyse TJM`                                |
| Réglages     | `Réglages Settings`               | `page-settings`                            | `Paramètres`                                 |

At every route checkpoint, `.panel-shell` must have non-zero width and height,
non-empty rendered text, no `bootstrap-error` and no
`[data-testid^='page-load-error-']`.

## Fixed bounds

The proof is bounded independently of Playwright defaults:

```text
scenario count                         = 13 total, 4 new
new grouped tab workflows              = 2
new auxiliary workflows                = 2
tabs                                   = 6
business checkpoints per grouped test = 3
post-reload UI actions per checkpoint  <= 1
warm proof reloads                     <= 8 across the 4 new scenarios
missions seeded per scenario           <= 2
profiles seeded per scenario           <= 1
experiences seeded per scenario        = 0
tracking rows seeded per scenario      <= 1
TJM records seeded per scenario        <= 4
chrome.storage seed keys               <= 8
IndexedDB rows captured per store      <= 16
capture attempts per checkpoint        <= 40
capture polling interval               = 100 ms
UI action timeout                      = 15 s
checkpoint timeout                     = 45 s
scenario timeout                       = 180 s
network recovery timeout               = 10 s
service-worker restarts in new tests   = 0
```

The first overflow or timeout produces one typed failure event. There is no
unbounded polling, recursive retry, sleep-based success, hidden queue or
best-effort continuation.

## Canonical local fixture data

### Shared non-authoritative UI flags

For scenarios that bypass onboarding, the test-only seed adapter may write only
these exact non-release keys before opening the proof page:

```text
feed_tour_seen              = true
first_scan_done             = true
kbd_cheatsheet_tip_seen     = true
profile_banner_dismissed    = true
favoriteMissions            = {}
```

It must not seed `settings`, `onboarding_completed`,
`missionpulse_settings_release_v1`, `premium_enabled` or
`premium_feature_enabled`. Consent is established through the real settings
release message protocol after the page opens.

### Base profile

The exact precondition profile is stored under IndexedDB key `current`:

```json
{
  "availability": null,
  "experiences": [],
  "firstName": "Avant",
  "jobTitle": "Consultant Frontend",
  "keywords": ["Svelte", "TypeScript"],
  "location": "Paris",
  "remote": "hybrid",
  "seniority": "senior",
  "tjmMax": 900,
  "tjmMin": 650
}
```

The physical IndexedDB record adds only `id: 'current'`. Public profile reads
must not expose that persistence key.

### Mission fixture

The service-worker seed adapter constructs `scrapedAt` as a real `Date` from
`2026-07-17T08:05:00.000Z`; all other fields are these exact values:

```json
{
  "client": "Client Preuve",
  "description": "Mission locale de preuve pour le package MV3.",
  "duration": "6 mois",
  "id": "mv3-tab-proof-001",
  "location": "Paris",
  "publishedAt": "2026-07-17T08:00:00.000Z",
  "remote": "hybrid",
  "score": 91,
  "scoreBreakdown": null,
  "semanticReason": null,
  "semanticScore": null,
  "seniority": "senior",
  "source": "free-work",
  "stack": ["Svelte", "TypeScript"],
  "startDate": "2026-09-01",
  "title": "Architecte TypeScript Packaged",
  "tjm": 850,
  "url": "https://example.invalid/missions/mv3-tab-proof-001"
}
```

The applications scenario uses the same valid mission shape with ID
`mv3-application-proof-001` and title `Lead Svelte Candidature`.

### Tracking fixtures

The Feed scenario starts with this canonical detected record, where
`T0 = 1735689600000`:

```json
{
  "currentStatus": "detected",
  "generatedAssetIds": [],
  "history": [{ "from": null, "note": null, "timestamp": 1735689600000, "to": "detected" }],
  "missionId": "mv3-tab-proof-001",
  "nextActionAt": null,
  "notes": "",
  "userRating": null
}
```

The applications scenario starts at `selected` with two contiguous history
entries: the record above for `mv3-application-proof-001`, followed by
`{from:'detected', to:'selected', timestamp:T0+1000, note:null}`.

### TJM history fixture

`chrome.storage.local['tjm_history']` contains exactly four `svelte` records:

| Date         | Region          | Seniority   | Min | Max | Average | Sample count |
| ------------ | --------------- | ----------- | --: | --: | ------: | -----------: |
| `2026-06-01` | `ile-de-france` | `senior`    | 650 | 750 |     700 |            4 |
| `2026-07-01` | `ile-de-france` | `senior`    | 700 | 800 |     750 |            4 |
| `2026-06-01` | `lyon`          | `confirmed` | 550 | 650 |     600 |            3 |
| `2026-07-01` | `lyon`          | `confirmed` | 580 | 680 |     630 |            3 |

Unfiltered analysis must expose four data points and both `Île-de-France` and
`Lyon`. Filtering `ile-de-france` must expose two data points, exactly one
region insight and the `Île-de-France` label.

## Test-only service-worker data seam

The current harness can seed `chrome.storage.local` but has no typed IndexedDB
fixture port. Implementation therefore requires a test-only
`PackagedScenarioDataAdapterV1` under `tests/`; it is never imported by
`src/`, never bundled into `dist`, and never exposed to application code.

The adapter is serialized as one immutable source string, hashed at test build
time and executed only through the current instrumented service-worker
evaluation capability. Its result is admitted only after a strict decoder
checks `schemaVersion`, `scenarioId`, `operationId`, counts and digest. Arbitrary
evaluation text, returned prose or exception text never selects a transition.

The adapter has exactly three operations:

```text
WAIT_READY
SEED_EXACT_SCENARIO
CAPTURE_EXACT_SCENARIO
```

`WAIT_READY` proves all of the following before seeding:

- `missionpulse.appDataVersion === 2`;
- IndexedDB database name is `missionpulse` and version is `5`;
- stores `missions`, `profile`, `connector_status`, `generated_assets`,
  `mission_tracking` and `quarantine` exist;
- the fresh profile contains no mission, profile or tracking row;
- no downgrade, migration error or quarantine fact is present.

`SEED_EXACT_SCENARIO` accepts only a closed discriminated fixture from this
model. It checks that the target stores are still empty, writes the exact
mission/profile/tracking rows in one bounded IndexedDB transaction, writes only
the allowlisted scenario storage keys, closes its database handle, reads every
written value back and returns a `ScenarioSeedReceiptV1`. It never clears or
resets production data, never opens a different database version and never
touches the settings release envelope.

`CAPTURE_EXACT_SCENARIO` is read-only. It closes its database handle before
returning a normalized snapshot. Dates become ISO strings; object keys and
primary-key result arrays are sorted before JCS hashing. It captures only:

- the allowlisted storage keys relevant to the current scenario;
- the current settings release public snapshot and raw V1 envelope projection;
- at most 16 rows from each of `missions`, `profile` and `mission_tracking`;
- database name, database version and store names.

The adapter source SHA-256, fixture JCS SHA-256, operation ID and result JCS
SHA-256 are included in every receipt. A source hash mismatch, malformed value,
unexpected row, extra seed key, read-back mismatch, blocked open, version drift
or transaction abort fails closed.

When the machine consumes the exact correlated `PRECONDITIONS_PROVED` event,
`SEED_EXACT_SCENARIO` is permanently disabled. Only read-only captures remain
available. Every business mutation after that explicit transition comes from a
visible UI action.

## Consent setup for non-onboarding scenarios

After local seeding and first panel open, but before the first business
checkpoint, the page uses the real bridge protocol:

1. send `GET_SETTINGS_RELEASE` and require a confirmed snapshot with
   `onboardingCompleted:false`;
2. send one `MUTATE_SETTINGS_RELEASE` intent with `kind:'set_consent'`, a fresh
   UUID request ID, the exact returned `baseRevision` and
   `targetConsent:true`;
3. require a `settled` / `committed` `set_consent` outcome whose snapshot has
   `onboardingCompleted:true`;
4. perform a setup reload and require the same confirmed consent from a new app
   bootstrap.

An already-true consent in a fresh scenario is fixture contamination and fails.
The setup mutation is not counted as one of the six tab mutations.

## Persistence snapshot and warm reload

Every business checkpoint produces a `PersistenceCheckpointV1`:

```text
{
  schemaVersion: 1,
  scenarioId,
  checkpointId,
  playwrightEpoch,
  pageUrl,
  adapterSha256,
  projection,
  projectionSha256
}
```

The projection contains only the fields named by that checkpoint. It is
captured after durable acknowledgement, then again after reload. Exact JCS
equality is required except for fields explicitly described as relational time
bounds. No field may be silently dropped to make equality pass.

A **warm proof reload** is exactly:

```text
same Page + same BrowserContext + same Chromium PID + same user-data directory
-> page.reload({ waitUntil: 'domcontentloaded' })
-> app bootstrap ready
-> no seed, no reset and no service-worker restart
-> navigate back to the checkpoint tab
-> UI assertion + read-only persistence capture
```

Current navigation is ephemeral, so a reload may legitimately return to Feed.
The test must navigate back to the target tab rather than claiming the selected
tab itself is persisted.

## Packaged scenario machine

Each new Playwright scenario invokes one private XState v5
`packagedTabScenarioMachine`. The model owns decisions; the shell owns browser,
page, storage, clock, UUID, hashing and assertion I/O.

### Context

```text
scenarioId
scenarioAttempt = 1
authorityMode = verification_only | activated_release
operationGeneration
scenarioPlanSha256
adapterSha256
fixtureSha256
dependencyAuthority | null
seedReceipt | null
currentCheckpointIndex
currentActionIndex
currentPostReloadActionIndex
checkpointPlan[]
preMutationSnapshot | null
postMutationSnapshot | null
postReloadSnapshot | null
networkMode = online | offline | restoring
pendingEffect | null
pageIdentity | null
failure | null
```

`dependencyAuthority` is the following closed discriminated union; no common
shape may erase the phase boundary:

```ts
type PackagedScenarioDependencyAuthorityV6 =
  | {
      authorityMode: 'verification_only';
      implementedModelAuthoritySetSha256: Sha256;
      sandboxSha256: Sha256;
      immutableSourceExecutionAuthoritySha256: Sha256;
      commandReceiptSetSha256: Sha256;
      activationSha256: null;
    }
  | {
      authorityMode: 'activated_release';
      verifiedModelAuthoritySetSha256: Sha256;
      activationSha256: Sha256;
      immutableSourceExecutionAuthoritySha256: Sha256;
      commandReceiptSetSha256: Sha256;
      sandboxSha256: null;
    };
```

The verification variant is accepted only with the complete private event
payload containing the implemented set and sandbox. The activated variant is
accepted only with the complete production event payload containing the joint
activation and its verified set. In both variants,
`commandReceiptSetSha256` is the digest of the complete nonempty ordered
parent-owned `ImmutableGitSourceCommandReceiptV1` array. Every receipt binds the
same `immutableSourceExecutionAuthoritySha256` and exact scenario command plan;
the event carries the receipts through its sandbox or activation rather than a
consumer-supplied digest-only substitute. Unknown or extra authority fields
reject.

`pendingEffect` is exactly:

```text
{
  effectId,
  operationGeneration,
  effectKind,
  checkpointId | null,
  actionId | null
}
```

`scenarioAttempt` can only be `1`. The Playwright runner may rerun a failed test
for diagnostics outside a release command, but a release proof with retries
greater than zero is ineligible.

Each bounded `checkpointPlan` entry contains closed `mutationActions[]` and
`postReloadActions[]` discriminated unions. The current non-empty post-reload
plans are exactly A2 `OPEN_PROFILE_EDITOR_AFTER_RELOAD`, A3
`EXPAND_SAVED_EXPERIENCE_DETAILS` and B2
`REAPPLY_TJM_REGION_FILTER_AFTER_RELOAD`; every other current checkpoint has an
empty post-reload action list.

The machine has at most one `pendingEffect`. Before emitting a Shell command, a
named `allocateEffect` action increments `operationGeneration` exactly once,
retains the complete pending tuple and places that same tuple in the command.
Every effect result repeats all five fields plus a strict receipt SHA-256. The
named `isCurrentEffectResult` guard requires exact equality with the retained
tuple and the current scenario/checkpoint/action. A current result atomically
clears the pending tuple before any successor is allocated. An early, stale,
wrong-kind, wrong-checkpoint, wrong-action, duplicate or post-cancellation
result cannot assign context or advance state.

Control events carry `scenarioId`, a unique bounded `eventId` and the exact
current `operationGeneration`. Effect-result events additionally carry the
complete pending-effect tuple and `receiptSha256`. `CHECKPOINT_STARTED` is the
only internal control event: the private machine raises it synchronously through
the named pure `raiseCheckpointStarted` action with exact checkpoint index, ID,
scenario-plan digest, current generation, `causeEffectId` and
`causeReceiptSha256` copied from the just-consumed `PRECONDITIONS_PROVED` or
`CHECKPOINT_PROVED`. The `isCurrentCheckpointStart` guard matches every one of
those fields against retained context. It is not exposed by the public facade,
cannot be supplied by the test shell and cannot arise from state entry alone.

### Closed events

```text
START
DEPENDENCIES_ADMITTED
VERIFICATION_DEPENDENCIES_ADMITTED
DEPENDENCY_ADMISSION_FAILED
READY_PROVED
SEED_PROVED
PANEL_OPENED
CONSENT_PROVED
PRECONDITIONS_PROVED
CHECKPOINT_STARTED
CHECKPOINT_ROUTE_PROVED
PRE_MUTATION_CAPTURED
UI_ACTION_PROVED
POST_MUTATION_CAPTURED
WARM_RELOAD_PROVED
POST_RELOAD_ACTION_READY
UI_REASSERTED
POST_RELOAD_CAPTURED
CHECKPOINT_PROVED
OFFLINE_FLOW_PROVED
OFFLINE_FLOW_FAILED
DIAGNOSTICS_PROVED
SCENARIO_FINISHED
EFFECT_FAILED
TIMEOUT
CANCELLED
CLEANUP_PROVED
CLEANUP_FAILED
```

`PRE_MUTATION_CAPTURED` is an effect result for the pending
`CAPTURE_PERSISTENCE/captureKind:'before'` command. It repeats that command's
exact effect ID, operation generation, effect kind, checkpoint ID, null action
ID and receipt SHA-256, plus the exact checkpoint index and before-projection
SHA-256. `UI_REASSERTED` is an effect result for the pending
`REASSERT_CHECKPOINT_UI` command. It repeats that command's exact effect ID,
operation generation, effect kind, checkpoint ID, null action ID and receipt
SHA-256, plus the exact checkpoint index, post-reload UI assertion-set SHA-256
and page identity. Neither may be inferred from entry into a state, a locator
resolution, visible prose or a later capture. Unknown or malformed events are
rejected at the schema boundary; schema-valid but stale or mismatched events are
retained as diagnostics and ignored.

`POST_RELOAD_ACTION_READY` is an effect result for the pending
`PREPARE_POST_RELOAD_UI_ACTION` command. It repeats the complete effect tuple,
post-reload action ID/index, exact accessible-anchor contract ID/hash,
`controlledTargetId:string|null` and precondition assertion-set SHA-256. The
closed action decoder requires a non-null `controlledTargetId` only for A3 and
requires it to equal the toggle's `aria-controls`; A2 and B2 require null. A
post-reload `UI_ACTION_PROVED` additionally carries
`actionPhase:'post_reload'` and must match that retained preparation proof. The
mutation-phase variant carries `actionPhase:'mutation'`. The two variants cannot
satisfy one another's guard.

### States and transitions

| State                                                                               | Event / named guard                                                                                                         | Next                               | Effect / named action                                                                                    |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `idle`                                                                              | `START`, exact scenario ID, generation `0`                                                                                  | `dependency_admitting`             | allocate and invoke `ADMIT_REQUIRED_AUTHORITIES`                                                         |
| `dependency_admitting`                                                              | current `DEPENDENCIES_ADMITTED`, exact activation, ordered verified set and immutable-source authority                      | `waiting_ready`                    | consume; set `authorityMode:'activated_release'`; allocate `WAIT_FOR_STORAGE_READY`                      |
| `dependency_admitting`                                                              | current private `VERIFICATION_DEPENDENCIES_ADMITTED`, exact sandbox, ordered implemented set and immutable-source authority | `waiting_ready`                    | consume; set `authorityMode:'verification_only'`; allocate `WAIT_FOR_STORAGE_READY`                      |
| `dependency_admitting`                                                              | current `DEPENDENCY_ADMISSION_FAILED`                                                                                       | `failed`                           | consume result; freeze blocker; emit no scenario effect                                                  |
| `dependency_admitting`                                                              | current `EFFECT_FAILED` for the exact pending `ADMIT_REQUIRED_AUTHORITIES` tuple                                            | `failed`                           | consume and fence admission effect; freeze transport blocker; allocate no browser cleanup                |
| `dependency_admitting`                                                              | current `TIMEOUT` or `CANCELLED` for the exact pending `ADMIT_REQUIRED_AUTHORITIES` tuple                                   | `failed`                           | consume and fence admission effect; freeze original cause; allocate no browser cleanup                   |
| `waiting_ready`                                                                     | current `READY_PROVED`                                                                                                      | `seeding`                          | consume; allocate exact scenario seed or fresh-state assertion                                           |
| `seeding`                                                                           | current `SEED_PROVED`                                                                                                       | `opening_panel`                    | consume; allocate `OPEN_SIDE_PANEL`                                                                      |
| `opening_panel`                                                                     | current `PANEL_OPENED` and `requiresConsent`                                                                                | `consenting`                       | consume; allocate `SET_ONBOARDING_CONSENT`                                                               |
| `opening_panel`                                                                     | current `PANEL_OPENED` and `isOnboardingScenario`                                                                           | `preconditions`                    | consume; allocate `ASSERT_PAGE_SURFACE`                                                                  |
| `consenting`                                                                        | current committed `CONSENT_PROVED`                                                                                          | `setup_reloading`                  | consume; allocate setup `WARM_RELOAD`                                                                    |
| `setup_reloading`                                                                   | current `WARM_RELOAD_PROVED` with `reloadKind:'setup'`                                                                      | `preconditions`                    | consume; allocate `ASSERT_PAGE_SURFACE`                                                                  |
| `preconditions`                                                                     | current `PRECONDITIONS_PROVED` and non-offline plan                                                                         | `checkpoint_selecting`             | consume; named pure `raiseCheckpointStarted`                                                             |
| `preconditions`                                                                     | current `PRECONDITIONS_PROVED` and offline plan                                                                             | `offline_running`                  | consume; invoke private offline child with exact plan digest                                             |
| `checkpoint_selecting`                                                              | exact internal `CHECKPOINT_STARTED`                                                                                         | `checkpoint_navigating`            | allocate `NAVIGATE_TO_TAB` for exact checkpoint                                                          |
| `checkpoint_navigating`                                                             | current `CHECKPOINT_ROUTE_PROVED`                                                                                           | `checkpoint_capturing_before`      | consume; allocate `CAPTURE_PERSISTENCE` with `captureKind:'before'`                                      |
| `checkpoint_capturing_before`                                                       | current `PRE_MUTATION_CAPTURED`                                                                                             | `checkpoint_mutating`              | consume; retain before snapshot; allocate first indexed UI action                                        |
| `checkpoint_mutating`                                                               | current `UI_ACTION_PROVED` with `actionPhase:'mutation'` and `hasMoreActions`                                               | `checkpoint_mutating`              | consume; increment action index; allocate next exact UI action                                           |
| `checkpoint_mutating`                                                               | current `UI_ACTION_PROVED` with `actionPhase:'mutation'` and `isFinalAction`                                                | `checkpoint_capturing_after`       | consume; allocate polling `CAPTURE_PERSISTENCE` with `captureKind:'after'`                               |
| `checkpoint_capturing_after`                                                        | current `POST_MUTATION_CAPTURED` and `mutationInvariantsHold`                                                               | `checkpoint_reloading`             | consume; retain after snapshot; allocate proof `WARM_RELOAD`                                             |
| `checkpoint_reloading`                                                              | current `WARM_RELOAD_PROVED` with exact checkpoint ID and `hasNoPostReloadActions`                                          | `checkpoint_reasserting`           | consume; allocate `REASSERT_CHECKPOINT_UI`                                                               |
| `checkpoint_reloading`                                                              | current `WARM_RELOAD_PROVED` with exact checkpoint ID and `hasPostReloadActions`                                            | `checkpoint_post_reload_preparing` | consume; reset post-reload action index; allocate `PREPARE_POST_RELOAD_UI_ACTION`                        |
| `checkpoint_post_reload_preparing`                                                  | current `POST_RELOAD_ACTION_READY` for exact indexed action                                                                 | `checkpoint_post_reload_acting`    | consume; retain accessible precondition proof; allocate exact closed UI action                           |
| `checkpoint_post_reload_acting`                                                     | current `UI_ACTION_PROVED` with `actionPhase:'post_reload'` and `hasMorePostReloadActions`                                  | `checkpoint_post_reload_preparing` | consume; increment post-reload action index; allocate next preparation                                   |
| `checkpoint_post_reload_acting`                                                     | current `UI_ACTION_PROVED` with `actionPhase:'post_reload'` and `isFinalPostReloadAction`                                   | `checkpoint_reasserting`           | consume; allocate `REASSERT_CHECKPOINT_UI`                                                               |
| `checkpoint_reasserting`                                                            | current `UI_REASSERTED`                                                                                                     | `checkpoint_recapturing`           | consume; retain UI proof; allocate `CAPTURE_PERSISTENCE` with `captureKind:'after_reload'`               |
| `checkpoint_recapturing`                                                            | current `POST_RELOAD_CAPTURED` and exact projection equality                                                                | `checkpoint_freezing`              | consume; retain reload snapshot; allocate `FREEZE_CHECKPOINT_EVIDENCE`                                   |
| `checkpoint_freezing`                                                               | current `CHECKPOINT_PROVED` and `hasMoreCheckpoints`                                                                        | `checkpoint_selecting`             | consume; increment checkpoint index; reset action index; named pure `raiseCheckpointStarted`             |
| `checkpoint_freezing`                                                               | current `CHECKPOINT_PROVED` and `isFinalCheckpoint`                                                                         | `diagnostics_checking`             | consume; allocate `ASSERT_RUNTIME_DIAGNOSTICS`                                                           |
| `offline_running`                                                                   | exact current parent `CANCELLED`                                                                                            | `offline_running`                  | forward correlated `OFFLINE_CANCELLED`; child fences its effect and owns cleanup                         |
| `offline_running`                                                                   | exact current parent `TIMEOUT` for the child deadline                                                                       | `offline_running`                  | forward correlated `OFFLINE_TIMEOUT`; child fences its effect and owns cleanup                           |
| `offline_running`                                                                   | current child `OFFLINE_FLOW_PROVED` with online terminal proof                                                              | `diagnostics_checking`             | retain child receipt; allocate `ASSERT_RUNTIME_DIAGNOSTICS`                                              |
| `offline_running`                                                                   | current child `OFFLINE_FLOW_FAILED`                                                                                         | `failed_cleaning`                  | retain child failure/cleanup receipt; allocate idempotent online cleanup                                 |
| `diagnostics_checking`                                                              | current `DIAGNOSTICS_PROVED`                                                                                                | `finishing`                        | consume; allocate `FREEZE_SCENARIO_EVIDENCE`                                                             |
| `finishing`                                                                         | current `SCENARIO_FINISHED` and `authorityMode === 'activated_release'`                                                     | `passed`                           | consume; freeze final release proof                                                                      |
| `finishing`                                                                         | current `SCENARIO_FINISHED` and `authorityMode === 'verification_only'`                                                     | `verified_only`                    | consume; freeze non-release model-verification evidence                                                  |
| any live state except dependency admission, `offline_running` and `failed_cleaning` | current `EFFECT_FAILED`                                                                                                     | `failed_cleaning`                  | consume/fence current effect; retain failure; allocate online cleanup exactly once                       |
| any live state except dependency admission, `offline_running` and `failed_cleaning` | current `TIMEOUT` or `CANCELLED`                                                                                            | `failed_cleaning`                  | retain event; fence the old effect with the sole new generation allocated to online cleanup exactly once |
| `failed_cleaning`                                                                   | current `CLEANUP_PROVED`                                                                                                    | `failed`                           | consume; freeze original failure plus cleanup proof                                                      |
| `failed_cleaning`                                                                   | current `CLEANUP_FAILED`                                                                                                    | `failed`                           | consume; freeze aggregate failure; never pass                                                            |

`passed`, `verified_only` and `failed` are final. `verified_only` has no release
authority and cannot transition to `passed`. A failed scenario cannot be healed by a later
capture, reload, retry or cleanup success. Every table row names the sole event
that can advance it; state entry, Promise completion, locator text and effect
arrival order have no transition authority.

The three admission transport rows are closed and exhaustive. Their guard
requires the exact retained scenario ID, effect ID, operation generation,
effect kind `ADMIT_REQUIRED_AUTHORITIES`, null checkpoint/action IDs and the
current admission deadline where applicable. Early, stale, duplicate,
wrong-kind or wrong-generation `EFFECT_FAILED`, `TIMEOUT` or `CANCELLED` is a
diagnostic exact no-op. A current admission failure clears/fences the retained
tuple, freezes the typed cause and enters final `failed`; because no browser or
scenario adapter has been allocated, it never allocates `ONLINE_CLEANUP`.

`failed_cleaning` is explicitly outside every generic or `any live state`
transition. Its predecessor allocates one cleanup effect and one cleanup
generation before entry; the state itself never allocates, retries or replaces
that effect. Its only outgoing transitions are the two rows above:
`CLEANUP_PROVED -> failed` and `CLEANUP_FAILED -> failed`. A cleanup transport
rejection, cleanup deadline expiry or cleanup assertion failure is decoded
directly as the one correlated `CLEANUP_FAILED`; it is never re-emitted as
`EFFECT_FAILED` or a second `TIMEOUT`. `TIMEOUT`, `CANCELLED`, `EFFECT_FAILED`,
duplicate/stale cleanup results and every other event have no transition in
`failed_cleaning`, allocate no generation or effect and cannot extend the
cleanup deadline. Thus cleanup has no retry, reallocation, recursive cleanup or
second timeout path.

### Effect allowlist

The machine may emit only these commands:

```text
ADMIT_REQUIRED_AUTHORITIES
WAIT_FOR_STORAGE_READY
SEED_SCENARIO
OPEN_SIDE_PANEL
SET_ONBOARDING_CONSENT
NAVIGATE_TO_TAB
CAPTURE_PERSISTENCE
CAPTURE_PAGE_TIMEZONE_ISO
CLICK_UI_CONTROL
FILL_UI_CONTROL
SELECT_UI_OPTION
WARM_RELOAD
PREPARE_POST_RELOAD_UI_ACTION
REASSERT_CHECKPOINT_UI
FREEZE_CHECKPOINT_EVIDENCE
FREEZE_SCENARIO_EVIDENCE
SET_BROWSER_CONTEXT_OFFLINE
SET_BROWSER_CONTEXT_ONLINE
ASSERT_PAGE_SURFACE
ASSERT_RUNTIME_DIAGNOSTICS
RESTORE_NETWORK_FOR_CLEANUP
```

No command accepts a free-form JavaScript expression, selector or expected
status. Scenario plans are closed discriminated unions compiled from this
document. An LLM may not generate a selector, fixture, expected value, event or
transition at runtime.

## Offline proof child machine

`packaged-tabs.offline-recovery` does not reuse the generic checkpoint loop for
network authority. `offline_running` invokes one private
`packagedOfflineProofMachine` whose state is the sole authority for network
mode, reload order, navigation and recovery.

Its context retains `scenarioId`, `scenarioPlanSha256`, `childGeneration`,
`pendingOfflineEffect`, page identity, pre-offline persistence digest, offline
favorite digest, offline TJM digest, post-reload digest, recovery digest,
`networkMode` and the first failure/cancellation. The child uses the same
single-pending-effect rule: each result repeats exact child generation, effect
ID, kind, page identity, scenario ID and receipt SHA-256.

The closed child events are:

```text
OFFLINE_REQUESTED
OFFLINE_PROVED
OFFLINE_FEED_PROVED
OFFLINE_FAVORITE_PROVED
OFFLINE_TJM_NAVIGATION_PROVED
OFFLINE_TJM_PROVED
OFFLINE_RELOAD_PROVED
OFFLINE_FEED_REASSERTED
OFFLINE_TJM_RENAVIGATION_PROVED
OFFLINE_TJM_REASSERTED
ONLINE_PROVED
ONLINE_RECOVERY_PROVED
OFFLINE_EFFECT_FAILED
OFFLINE_TIMEOUT
OFFLINE_CANCELLED
ONLINE_CLEANUP_PROVED
ONLINE_CLEANUP_FAILED
```

`OFFLINE_REQUESTED` and `OFFLINE_CANCELLED` are correlated control events with
exact event ID and current child generation. Every `*_PROVED`,
`OFFLINE_EFFECT_FAILED` and cleanup result is a current effect-result event with
the complete pending-offline-effect tuple. `OFFLINE_TIMEOUT` carries the exact
current deadline ID and generation. No free-form network text or
`navigator.onLine` value alone is an event.

On invocation, the parent passes the already proved online Feed surface, page
identity and pre-offline persistence digest. The named pure
`raiseOfflineRequested` action synchronously raises the sole internal
`OFFLINE_REQUESTED` event with those retained hashes. Merely entering
`online_baseline` cannot advance the child. A child-owned shell effect failure
is decoded directly as `OFFLINE_EFFECT_FAILED`; it is never surfaced as a
generic parent `EFFECT_FAILED`.

| Child state                                                    | Event / named guard                                                                  | Next                       | Effect                                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `online_baseline`                                              | exact internal `OFFLINE_REQUESTED` and baseline UI/storage proof retained            | `entering_offline`         | allocate `SET_BROWSER_CONTEXT_OFFLINE`                                                                                            |
| `entering_offline`                                             | current `OFFLINE_PROVED`, browser offline and exact Feed UI offline                  | `offline_feed`             | consume; set `networkMode:'offline'`; allocate closed cached-Feed assertions                                                      |
| `offline_feed`                                                 | current `OFFLINE_FEED_PROVED`                                                        | `offline_favoriting`       | consume; allocate exact favorite UI action and durable polling                                                                    |
| `offline_favoriting`                                           | current `OFFLINE_FAVORITE_PROVED`                                                    | `offline_tjm_navigating`   | consume; allocate exact `TJM` navigation                                                                                          |
| `offline_tjm_navigating`                                       | current `OFFLINE_TJM_NAVIGATION_PROVED`                                              | `offline_tjm`              | consume; allocate offline TJM cache/filter/capture assertions                                                                     |
| `offline_tjm`                                                  | current `OFFLINE_TJM_PROVED`                                                         | `offline_reloading`        | consume; retain TJM digest; allocate warm reload while offline                                                                    |
| `offline_reloading`                                            | current `OFFLINE_RELOAD_PROVED`, same process/context/page and browser still offline | `offline_feed_reasserting` | consume; allocate packaged shell, six-tab, Feed cache and favorite reassertion                                                    |
| `offline_feed_reasserting`                                     | current `OFFLINE_FEED_REASSERTED`                                                    | `offline_tjm_renavigating` | consume; allocate exact `TJM` navigation after reload                                                                             |
| `offline_tjm_renavigating`                                     | current `OFFLINE_TJM_RENAVIGATION_PROVED`                                            | `offline_tjm_reasserting`  | consume; allocate TJM cache/history/filter reassertion                                                                            |
| `offline_tjm_reasserting`                                      | current `OFFLINE_TJM_REASSERTED` and pre/post reload data equality                   | `restoring`                | consume; set `networkMode:'restoring'`; allocate `SET_BROWSER_CONTEXT_ONLINE`                                                     |
| `restoring`                                                    | current `ONLINE_PROVED`, browser online and offline listeners settled                | `online_reasserting`       | consume; set `networkMode:'online'`; allocate recovery UI and no-data-loss capture                                                |
| `online_reasserting`                                           | current `ONLINE_RECOVERY_PROVED`                                                     | `passed`                   | consume; freeze online recovery receipt and return `OFFLINE_FLOW_PROVED`                                                          |
| any state from `entering_offline` through `online_reasserting` | current `OFFLINE_EFFECT_FAILED` or `OFFLINE_TIMEOUT`                                 | `failed_restoring`         | consume/fence current effect; retain first failure; allocate `RESTORE_NETWORK_FOR_CLEANUP` as the sole child-generation increment |
| any state from `entering_offline` through `online_reasserting` | exact `OFFLINE_CANCELLED`                                                            | `cancelled_restoring`      | fence pending effect; retain cancellation; allocate `RESTORE_NETWORK_FOR_CLEANUP` as the sole child-generation increment          |
| `failed_restoring`                                             | current `ONLINE_CLEANUP_PROVED`                                                      | `failed`                   | freeze original failure plus correlated online proof                                                                              |
| `failed_restoring`                                             | current `ONLINE_CLEANUP_FAILED`                                                      | `failed`                   | freeze aggregate failure and cleanup failure                                                                                      |
| `cancelled_restoring`                                          | current `ONLINE_CLEANUP_PROVED`                                                      | `cancelled`                | freeze cancellation plus correlated online proof                                                                                  |
| `cancelled_restoring`                                          | current `ONLINE_CLEANUP_FAILED`                                                      | `cancelled`                | freeze cancellation plus cleanup failure                                                                                          |

The child final states are `passed`, `failed` and `cancelled`. `failed` and
`cancelled` both return `OFFLINE_FLOW_FAILED` to the parent with the exact child
terminal receipt and whether correlated online cleanup succeeded. Cleanup calls
`setOffline(false)` idempotently even if failure occurred after the browser had
already returned online. A cleanup timeout, stale cleanup result or page loss is
decoded as the correlated `ONLINE_CLEANUP_FAILED` result, retained and can never
produce `OFFLINE_FLOW_PROVED`. The parent applies the same rule to its final
idempotent cleanup: its bounded cleanup deadline emits `CLEANUP_FAILED`, never a
second `TIMEOUT` transition or an unbounded wait.

## Scenario A — Feed, Profil and CV persistence

Scenario ID:
`packaged-tabs.feed-profile-cv-persistence`.

Setup writes the shared flags, base profile, mission
`mv3-tab-proof-001`, empty favorites and its detected tracking record. It then
establishes consent through the current release protocol.

### Checkpoint A1 — Feed favorite and tracking

1. Navigate through the exact `Feed` button and resolve exactly one
   `role=article` whose accessible name is
   `Mission Architecte TypeScript Packaged chez Client Preuve` inside
   `mission-feed`. The article root is non-interactive: it has no click or
   keyboard transition, no `tabindex`, and never impersonates a button.
2. Scope every following control to that article. Resolve exactly one favorite
   button named `Ajouter la mission aux favoris` with `aria-pressed=false`.
   Resolve exactly one `role=group` named
   `Statut de la mission Architecte TypeScript Packaged`; inside that group,
   resolve exactly one `role=status` named `Statut actuel : Détectée` and one
   allowed transition button named `Passer le statut à Sélectionnée`. Resolve
   exactly one disclosure button named
   `Afficher les détails de la mission Architecte TypeScript Packaged`. The
   disclosure owns `aria-expanded=false` and
   `aria-controls=<stable bounded mission details id>` before its first click.
   That ID is unique in the document, remains byte-identical for the mounted
   article, matches `^mission-details-[A-Za-z][A-Za-z0-9-]{0,63}$` and is
   17..80 ASCII code units inclusive. Nested interactive content inside an
   interactive card root, a page-global match, card index, `nth`, CSS class,
   pixel position or bare title-text match is a terminal anchor failure.
3. Click the scoped disclosure exactly once. Require that same button to expose
   the new accessible name
   `Masquer les détails de la mission Architecte TypeScript Packaged`,
   `aria-expanded=true` and its controlled visible `role=region`, with the
   exact retained ID, to be named
   `Détails de la mission Architecte TypeScript Packaged`. This inline
   disclosure transition is distinct from `onInvestigate`/drawer navigation;
   neither transition may be inferred from clicking the article surface.
4. Record `actionStartedAt` from the test shell.
5. Click `Ajouter la mission aux favoris`. The accessible name and pressed
   state remain `Ajouter la mission aux favoris` / `false` until the correlated
   favorite persistence acknowledgement is consumed; only then do they become
   `Retirer la mission des favoris` / `true`.
6. Click the allowed status target `Passer le statut à Sélectionnée` from the
   seeded `Détectée` tracking state. From effect allocation until its correlated
   tracking acknowledgement or failure, the named status group exposes
   `aria-busy=true`, the current status remains
   `Statut actuel : Détectée` and every transition control in the group is
   disabled. A committed acknowledgement changes the unique status projection
   to `Statut actuel : Sélectionnée`, clears busy and projects the next allowed
   transition set. A failure clears busy, preserves `Détectée`, re-enables only
   the still-allowed controls and emits `EFFECT_FAILED`; optimistic text cannot
   normalize that path into success.
7. Record `actionSettledAt` only after both public bridge reads and the raw
   persistence capture agree.

The durable projection must prove:

- `favoriteMissions` has exactly one own key,
  `mv3-tab-proof-001`;
- its value is a safe integer in the inclusive
  `[actionStartedAt, actionSettledAt]` interval;
- the raw `mission_tracking` row and `GET_TRACKINGS` projection are equal;
- `currentStatus === 'selected'`;
- history has exactly two contiguous entries and ends with
  `detected -> selected`;
- the new transition timestamp is in the same action interval and is not less
  than the seeded timestamp;
- the mission row is still present and valid.

After warm proof reload, the same uniquely named article must still expose the
same named status group, no busy state, the unique
`role=status[name="Statut actuel : Sélectionnée"]`, and its scoped favorite
control named `Retirer la mission des favoris` with `aria-pressed=true`. The
durable projection, including both stored timestamps, is byte-equivalent to its
post-mutation projection.

### Checkpoint A2 — Profil edit, save and reload

1. Navigate to `Profil` and click `Modifier mes critères`.
2. Replace the fields selected by their real placeholders:
   - `Prénom` -> `Camille Packaged`;
   - `Poste (ex: Développeur React Senior)` -> `Architecte Svelte`;
   - `Localisation` -> `Lyon`;
   - `TJM min` -> `720`;
   - `TJM max` -> `980`.
3. Fill `Mots-clés` with `MV3-Proof`, click `Ajouter le mot-clé`, and require
   the new chip before saving.
4. Click `Enregistrer le profil`; wait for the Profile actor to leave `saving`
   and for `GET_PROFILE` plus the raw `profile/current` row to agree.

The saved profile must preserve `remote:'hybrid'`, `seniority:'senior'`, the
empty experience list and `availability:null`; it must preserve the two seeded
keywords and append `MV3-Proof` exactly once. No stale `stack` or
`searchKeywords` field may appear.

After warm proof reload and a return to Profil, the
`OPEN_PROFILE_EDITOR_AFTER_RELOAD` plan first emits
`POST_RELOAD_ACTION_READY` only after the rendered summary and unique
`Modifier mes critères` button prove the changed identity. Its correlated
post-reload `UI_ACTION_PROVED` opens the editor exactly once. Only then may
`UI_REASSERTED` prove every changed form value. The physical `id:'current'`
record and the public profile projection must otherwise match their post-save
values.

### Checkpoint A3 — CV add, save and reload

1. Navigate to `CV` and click `Ajouter une expérience` from the empty state.
2. Fill the labeled fields exactly:
   - Titre du poste: `Lead Packaged UI`;
   - Entreprise: `MissionPulse QA`;
   - Type de contrat: `Freelance`;
   - Début: `2025-01`;
   - Poste actuel: checked;
   - Localisation: `Lyon`;
   - Description: `Preuve CV locale dans Chrome MV3.`;
   - Compétences: `Svelte, TypeScript, Playwright`.
3. Click the form's `Enregistrer` button and wait for the CV edit actor to leave
   `saving` and for the profile bridge/raw record to agree.

The new experience must have a non-empty generated ID different from `blank`,
`source:'manual'`, `sourceExternalId:null`, `positionIndex:0`,
`isCurrent:true`, `endDate:null`, and an `updatedAt` safe integer inside the
save interval. Every Profile checkpoint value must remain unchanged.

After warm proof reload and a return to CV, checkpoint A3 performs the closed
action `EXPAND_SAVED_EXPERIENCE_DETAILS`; it does not infer an open card from
skill text. The action is legal only after the separately modeled CV accessible
anchor dependency has been admitted. It must:

1. resolve exactly one `article` named
   `Expérience Lead Packaged UI chez MissionPulse QA` and require that article
   to show `Lead Packaged UI`, `MissionPulse QA` and `Freelance`;
2. within that article, resolve exactly one button named
   `Afficher les détails de l’expérience Lead Packaged UI` with
   `aria-expanded=false` and an `aria-controls` value equal to the stable,
   unique, bounded details-region ID retained by
   `POST_RELOAD_ACTION_READY`;
3. click the button exactly once and consume only its correlated
   `UI_ACTION_PROVED` event;
4. require the same button to expose `aria-expanded=true` and the controlled
   visible `region` with that exact retained ID to be named
   `Détails de l’expérience Lead Packaged UI`;
5. assert `Svelte`, `TypeScript` and `Playwright` as skill badges scoped inside
   that controlled region before emitting `UI_REASSERTED`.

A missing, duplicated or differently named article, toggle, controlled region
or skill is terminal failure. Card index, `nth`, DOM ancestry outside the
article, CSS class, pixel position and visible-text guessing are forbidden. The
generated ID and `updatedAt` must be identical to the post-save capture; reload
must not recreate the experience.

## Scenario B — Candidatures, TJM and Réglages persistence

Scenario ID:
`packaged-tabs.applications-tjm-settings-persistence`.

Setup writes the shared flags, base profile, applications mission, selected
tracking record and exact four-record TJM history. It establishes consent
through the current release protocol. It does not seed a Settings envelope or
theme value.

### Checkpoint B1 — Candidature transition, details and reload

1. Navigate through `Suivi` to the `Candidatures` page.
2. Select `Lead Svelte Candidature` from the missions list and require its
   current `Sélectionnée` status.
3. Record the action time bounds and click the allowed target `Préparée`.
4. Fill `Prochaine action` with local datetime `2035-01-15T09:30`.
5. In the page context, compute the expected ISO using the same browser
   timezone rule, `new Date(localValue).toISOString()`, then click the adjacent
   `Enregistrer`.
6. Wait until `GET_TRACKINGS` and the raw row agree.

The row must have `currentStatus:'application_prepared'`, a third contiguous
history entry `selected -> application_prepared`, a transition timestamp
inside the action interval and `nextActionAt` exactly equal to the captured ISO.
Generated asset IDs, rating and notes remain unchanged.

After warm proof reload and a return to Suivi, the selected mission must show
`Préparée`, the local datetime input must round-trip to
`2035-01-15T09:30`, and `Historique des décisions` must contain the prepared
transition. The persistence projection is unchanged.

### Checkpoint B2 — TJM seed, filter and reload

1. Navigate to `TJM` and require unfiltered analysis with four data points and
   one `role=region` named `TJM par région`. That region contains exactly one
   native `h3` named `TJM par région` and one semantic `ul` named
   `Régions analysées`; each region result is exactly one direct `li` whose
   unique native `h4` is its accessible identity. The unfiltered list therefore
   has exactly two list items headed `Île-de-France` and `Lyon`. A generic
   `div`, visual label, progress bar, filter option or page-global text match
   cannot satisfy the region, list, list-item or heading anchor.
2. Select `ile-de-france` through the control labeled
   `Filtrer les tendances TJM par région`.
3. Require the filtered analysis to expose two data points, exactly one region
   insight and exactly one direct `li` with one `h4` headed
   `Île-de-France` in the `Régions analysées` list; no `li` headed `Lyon` may
   remain inside
   `role=region[name="TJM par région"]`. The persistent region filter is
   intentionally outside that assertion: `Lyon` may and must remain available
   in its `<option>` catalogue, so a page-wide absence assertion is forbidden.
4. Capture `tjm_history` and require exact equality with the seeded four records.

The selected region is deliberately ephemeral UI state. After warm proof
reload, `REAPPLY_TJM_REGION_FILTER_AFTER_RELOAD` may emit
`POST_RELOAD_ACTION_READY` only after `Toutes les régions` is selected, the raw
history is unchanged, the unfiltered four-point analysis has returned and the
unique control labeled `Filtrer les tendances TJM par région` is ready. Its
correlated post-reload `UI_ACTION_PROVED` selects `ile-de-france`; only the
following `UI_REASSERTED` may prove the same two-point result. Persisting the
dropdown selection would violate, not satisfy, this checkpoint.

### Checkpoint B3 — Réglages mutation and reload

1. Navigate to `Réglages Settings` and read the current confirmed Settings
   release snapshot. Resolve exactly one `role=group` named `Apparence`, with
   exactly the three native buttons `Clair`, `Sombre` and `Système`, no fourth
   interactive descendant and `aria-busy=false`. Every button exposes an
   explicit boolean `aria-pressed`; exactly one is `true`, and it corresponds
   to the confirmed snapshot theme.
2. Click `Sombre` inside that group. From mutation allocation until the
   correlated confirmed snapshot or failure is consumed, the group exposes
   `aria-busy=true` and all three controls are natively disabled.
   `aria-pressed` continues to
   represent the last confirmed theme; it must not move optimistically on the
   physical click.
3. Wait for the UI settings actor to settle, then require a confirmed release
   snapshot with `settings.theme === 'dark'`, a strictly greater revision and
   generation, no pending transaction, and a raw V1 envelope whose confirmed
   theme is also `dark`. Only after that confirmation may `Sombre` expose
   `aria-pressed=true`; `Clair` and `Système` expose `aria-pressed=false`, the
   group exposes `aria-busy=false`, and all three controls are enabled.
4. Require `document.documentElement.classList` to contain `dark`.

If the settings mutation fails, its correlated failure restores
`aria-busy=false` and re-enables the three controls, but the previously
confirmed button remains
the sole `aria-pressed=true` control, the confirmed release snapshot and raw V1
envelope remain unchanged, and no unconfirmed theme class is retained. That
path emits `EFFECT_FAILED` for checkpoint B3 and can never be normalized into
success by a toast, optimistic DOM state or later uncorrelated snapshot.

After warm proof reload and a return to Réglages, the same uniquely named group
must expose exactly the same three controls, only `Sombre` pressed, none busy or
disabled. The public snapshot, raw confirmed theme, revision and generation
must equal the post-mutation capture, and the document must still use the
`dark` class. This is proof of the current release envelope only; it does not
emit a Settings V2 writer-fence claim.

## Scenario C — Onboarding completion and reload

Scenario ID: `packaged-tabs.onboarding-completion`.

The fixture is fresh. It contains no profile, mission, tracking, first-scan flag,
legacy onboarding key or confirmed consent. No seed operation writes business
data.

1. Open the packaged panel and require `page-onboarding`, `Premier lancement`
   and no navigation bar.
2. Click `Configurer le radar`.
3. Select the first visible connector from the build-filtered catalogue and
   click `Continuer avec <name>`. The selected connector ID/name are captured as
   ephemeral UI evidence only.
4. Click `Créer une première alerte`.
5. On the alert step, fill:
   - Prénom: `Nora Packaged`;
   - Poste recherché: `Consultante Svelte`;
   - Mots-clés: `Svelte` and add it;
   - Localisation souhaitée: `Paris`;
   - Mode de travail: `Hybride`;
   - TJM cible: `750`.
6. Set the alert range to `85` and click `Voir le premier insight`. Require the
   real `SAVE_CONNECTED_ALERT_PREFERENCES` acknowledgement before advancing;
   because the profile draft was filled first, this acknowledgement must bind
   daily rate `750` and required stack `Svelte`.
7. On the insight step, click `Sauvegarder mon profil`, never `Passer et voir le feed` or
   `Passer l’onboarding`.
8. Wait for profile persistence, then the real consent mutation, then the Feed
   route.

The post-completion projection must prove:

- `profile/current` equals the normalized profile: `tjmMin:750`,
  `tjmMax:900`, `seniority:'senior'`, `experiences:[]`, `availability:null`;
- public `GET_PROFILE` agrees with the raw record;
- `missionpulse.connectedAlertPreferences` is enabled with threshold `85`,
  minimum daily rate `750`, required stacks `['Svelte']`, maximum results `5`,
  null mute and a valid positive revision/timestamp;
- the Settings release snapshot is confirmed with
  `onboardingCompleted:true`;
- there is no legacy `onboarding_completed` key after release migration;
- no source-persistence assertion is emitted.

After warm proof reload, initial routing must go directly to Feed,
`page-onboarding` must be absent, and the profile, alert preferences and release
snapshot must equal their post-completion projections. The captured source
choice remains explicitly non-durable until `onboarding-source.model.md` is
connected to runtime.

## Scenario D — Offline and recovery

Scenario ID: `packaged-tabs.offline-recovery`.

Setup uses the shared flags, base profile, mission, empty favorites and the
four-record TJM history, then establishes real consent.

The numbered product proof below is an exact projection of the offline child
machine, not a second orchestration authority:

1. In `online_baseline`, open Feed online and retain the cached mission, normal
   scan control, page identity and pre-offline persistence digest. The internal
   correlated `OFFLINE_REQUESTED` event alone may allocate the offline command.
2. In `entering_offline`, invoke Playwright
   `BrowserContext.setOffline(true)` on the real current context. Dispatching
   synthetic `online`/`offline` DOM events is forbidden. Only correlated
   `OFFLINE_PROVED` may set `networkMode:'offline'` after it proves
   `navigator.onLine === false`, the accessible `Hors ligne` indicator, banner
   `Mode hors ligne — Données en cache uniquement`, cached mission visibility
   and disabled scan control labeled `Scan indisponible hors ligne`.
3. In `offline_feed` then `offline_favoriting`, prove the cached Feed and
   favorite the mission through its visible control. Only correlated
   `OFFLINE_FAVORITE_PROVED` after durable acknowledgement may advance.
4. In `offline_tjm_navigating` then `offline_tjm`, navigate through the exact
   `TJM` button and require `Mode hors ligne`, `Cache local`, the unchanged
   four-record history and working `ile-de-france` local filter. Retain the
   correlated `OFFLINE_TJM_PROVED` projection digest.
5. In `offline_reloading`, perform exactly one warm proof reload while the
   context remains offline. `OFFLINE_RELOAD_PROVED` must bind the unchanged
   process, context and page identity and prove the browser is still offline.
6. In `offline_feed_reasserting`, require offline bootstrap, all six navigation
   buttons, cached mission and durable favorite on Feed. Then
   `offline_tjm_renavigating` must navigate through the exact `TJM` button after
   reload, and `offline_tjm_reasserting` must re-prove the unchanged history,
   local filter result and pre/post reload data equality. The prior TJM page
   being visible before reload cannot substitute for these two correlated
   post-reload events.
7. Only from `restoring` may the child invoke
   `BrowserContext.setOffline(false)`. Correlated `ONLINE_PROVED` must establish
   `navigator.onLine === true` and settled connection listeners before the
   child enters `online_reasserting`. Correlated `ONLINE_RECOVERY_PROVED` must
   then prove the recovery toast `Connexion restaurée`, removal of the
   offline-only scan label and no loss of profile, mission, favorite or TJM data
   before the child can pass.

Every offline command and result carries the child effect ID, generation,
effect kind, page identity and receipt digest defined above. A failure or
timeout in any live offline state enters `failed_restoring`; cancellation enters
`cancelled_restoring`. Both retain the first cause and require a separately
correlated, idempotent online-cleanup result. No stale success, UI text, cleanup
success or outer-machine inference can turn either path into a pass.

No network response is needed for success. Recovery proves local truth and UI
reenablement, not connector reachability.

## Cross-scenario invariants

1. The sealed `dist` tree hash before launch equals the hash after all effects.
2. `allDependenciesExact` is false unless the admitted phase value binds this
   revision 11, approved/implemented/verified MV3 harness revision 26 at behavior hash
   `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`,
   release-readiness clarification 11 and CV accessible-anchor revision 6 at
   behavior hash
   `d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98`
   to their exact behavior plus distinct review, implementation and
   verification receipt hashes, all bound by one committed joint activation
   receipt.
3. `inventoryBlobSha256` proves the complete committed V2 object while
   `scenarioMatrixSha256` proves only its ordered scenario array. Parent and
   child authority require both exact values and never swap, alias or derive one
   from the other.
4. Every non-offline checkpoint advances through the exact closed sequence
   `CHECKPOINT_STARTED` -> `CHECKPOINT_ROUTE_PROVED` ->
   `PRE_MUTATION_CAPTURED` -> indexed `UI_ACTION_PROVED` events ->
   `POST_MUTATION_CAPTURED` -> `WARM_RELOAD_PROVED` -> the checkpoint's bounded
   zero-or-more `POST_RELOAD_ACTION_READY` / post-reload `UI_ACTION_PROVED`
   pairs -> `UI_REASSERTED` -> `POST_RELOAD_CAPTURED` ->
   `CHECKPOINT_PROVED`. No state entry or later proof implies an omitted event.
5. The machine and offline child each retain at most one pending effect. Exact
   effect ID, generation, kind, scenario, checkpoint/action where applicable and
   receipt correlation is required before any result can mutate context.
6. Every business mutation after preconditions originates from an exact visible
   UI control; the test adapter never writes expected postconditions.
7. Side-panel code never reads IndexedDB directly. Test-only IndexedDB setup and
   capture run in the instrumented service-worker context.
8. A UI toast, CSS class, rendered label or optimistic local state is never
   sufficient persistence proof; the public bridge and raw persistence must
   agree.
9. A raw persistence row without the matching UI projection is also failure.
10. Every allowed tracking edge comes from `APPLICATION_TRANSITIONS`; no test
    patches status directly after setup.
11. Profile save preserves unrelated fields. CV save preserves all profile
    fields. Reload never creates a second experience or tracking transition.
12. After the CV reload, skills may be asserted only after the exact accessible
    article/toggle/controlled-region contract and closed expansion action pass.
    CSS position or already-visible skill text has no authority.
13. Favorites use their stored first-favorited timestamp; reload cannot replace
    it with a new timestamp.
14. TJM filter selection is ephemeral, while `tjm_history` is durable.
15. Theme proof uses the current release V1 snapshot/envelope and never claims
    Settings V2 global writer fencing.
16. Onboarding completion requires the full save path. Skip is not equivalent
    proof.
17. Offline state comes from real browser network emulation, not DEV stubs or
    synthetic DOM events.
18. The offline child solely owns offline entry, offline Feed mutation, TJM
    navigation, offline reload, post-reload Feed/TJM reassertion, restoration
    and recovery. Failure and cancellation always retain their cause and end in
    correlated online cleanup or an explicit cleanup failure.
19. Warm reload keeps process, profile, context and Playwright epoch fixed. A
    service-worker restart invalidates this proof path and belongs to its
    existing scenario.
20. Zero page errors, worker exceptions, error console entries, failure-class
    warnings, unhandled rejections and late blocking diagnostics are required.
21. No optional host permission, external credential, backend or LLM output
    decides a transition.
22. The first failed invariant blocks the verdict. Later cleanup cannot turn it
    green.
23. `failed_cleaning` is excluded from all generic transitions. Its already
    allocated cleanup effect terminates only through one current
    `CLEANUP_PROVED` or `CLEANUP_FAILED`; no retry, reallocation, recursive
    cleanup, generic failure event or second timeout exists.
24. Model review authorizes only the closed joint implementation phase. No V2
    release authority exists before one atomic `JOINT_AUTHORITY_ACTIVATED` CAS;
    partial producer, consumer, harness, scenario or inventory activation is
    forbidden.
25. `verification_only` and `activated_release` are disjoint authority modes.
    Sandbox success terminates at `verified_only`, is never a packaged release
    gate, and cannot be promoted; the post-activation release suite runs again
    from a fresh scenario attempt under activated authority.
26. Every scenario process and descendant inherits one immutable-source mount
    authority. Source and its ancestors are recursively read-only throughout
    execution; only closed output mounts are writable, and none may shadow a
    tracked or authority-bearing path. Pre/post equality without this OS
    prevention is insufficient.
27. A mission-card root is a uniquely named non-interactive article. Only its
    explicit scoped disclosure control can expand inline details; favorite,
    status, disclosure and investigation controls remain independent actions.
    An interactive card root containing nested controls is invalid even if a
    browser happens to expose usable descendants.
28. TJM region assertions resolve the uniquely named results region and its
    named semantic list. Filtering may remove a region result item but never
    removes the same region from the filter-option catalogue; the two scopes
    cannot satisfy or invalidate one another.
29. Theme selection is a confirmed-state projection. Exactly one control is
    pressed at rest; while a mutation is pending, all three controls are
    disabled, the group is busy and the prior confirmed control stays pressed.
    Success moves the pressed state only with the correlated confirmation;
    failure deterministically restores the same prior confirmed projection.
30. The sole `test-mv3` diagnostic uploader matches the complete exact
    `diagnostic_only` contract in this file. It has read-only job permission and
    zero candidate/activation authority; changing it, adding another uploader
    or presenting any diagnostic receipt as candidate evidence blocks before
    release actor construction.

## Review obligations before implementation

An independent reviewer must verify the exact raw file hash and answer every
item below with evidence:

### Authority and explicit transition closure

- reproduce the raw UTF-8/LF pending behavior hash using only the specified
  placeholder substitution and bind the review receipt to those exact bytes;
- confirm that dependency receipt hashes are not edited into this model and
  that runtime authority requires three distinct immutable receipts per model;
- confirm that no release-authorizing verdict can be issued while the
  exact harness revision-26 hash
  `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`
  lacks any matching approval, implementation or verification receipt, or
  while the release-readiness clarification-11, revision-11, joint-activation or
  CV anchor authority is missing;
- confirm the CV anchor tuple is exactly revision 6 at behavior hash
  `d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98`
  and that no withdrawn revision-5 receipt, worktree implementation or focused
  component pass can satisfy its distinct implementation/verification slots;
- confirm parent clarification 11 and this child jointly require the distinct
  blob digest `b386a936abad72ccd4fe2b0dd5cdf2390a6762e3d2ce3e0b0e07635f16f6a1ef`
  and scenario-matrix digest
  `2a9c9f67e0c19a0dae126f7db15c25a0c1411b0753e63ecad6eaa0824720f79a`;
- trace `review_waiting -> implementing -> verification_pending ->
evidence_frozen -> verified -> activated`, prove implementation can proceed
  jointly without authority, and
  prove only one catalog CAS can activate all V2 consumers together;
- prove the private verification sandbox can reach only `verified_only`, cannot
  emit a release gate, and that activated release proof reruns the scenarios
  rather than promoting sandbox evidence;
- prove each command and descendant enters with the same read-only source mount,
  empty capability bounding set, `no_new_privs` and closed writable output mount
  set; hostile write/chmod/link/symlink/mount/remount/namespace attempts fail
  during execution rather than being detected only after restoration;
- prove no privileged service socket, FUSE device, sudo/setuid/file-capability
  gain or helper broker lets a child ask another process to mutate source;
- prove workflow inspection accepts exactly the pinned `test:mv3`
  `diagnostic_only` uploader and rejects candidate bytes, `dist`, unbounded
  paths, a mutable action, a second uploader or any diagnostic receipt used as
  release authority;
- prove every writable mount target was absent from the Git tree, empty before
  attachment, is outside authority-bearing paths, and cannot overlay or shadow a
  source, module, test, fixture, harness, Playwright config, script, lock or
  config byte;
- trace every machine row from one typed event to one named guard/action and
  verify `CHECKPOINT_STARTED`, `PRE_MUTATION_CAPTURED` and `UI_REASSERTED` have
  exact effect/generation/checkpoint correlation rather than implicit entry or
  Promise authority;
- verify mutation and post-reload `UI_ACTION_PROVED` variants are phase-typed
  and cannot satisfy one another's guards;
- trace the complete online -> offline Feed -> offline TJM -> offline reload ->
  Feed reassertion -> TJM re-navigation/reassertion -> restoring -> online
  recovery path, plus failure, timeout and cancellation cleanup;
- verify checkpoint A3 performs its closed post-reload expansion action through
  the separately reviewed accessible article/toggle/region contract before any
  skill assertion, with no CSS or positional fallback.
- verify checkpoint A1 resolves exactly one article named
  `Mission Architecte TypeScript Packaged chez Client Preuve`, that its root is
  non-interactive, and that its favorite pressed state, named status group,
  unique `role=status`, busy/disabled settlement projection and stable bounded
  controlled-details disclosure are independently scoped; reject
  nested-button pseudo-cards, article-surface clicks, optimistic status/favorite
  success and drawer/disclosure transition conflation;
- verify checkpoint B2 resolves only `role=region[name="TJM par région"]` and
  the unique `h3`, `list[name="Régions analysées"]`, direct `li` items and their
  unique `h4` headings; prove the Lyon absence check cannot inspect or be
  satisfied by the filter options;
- verify checkpoint B3 resolves only `role=group[name="Apparence"]`, proves the
  exact `Clair`/`Sombre`/`Système` set, exactly one confirmed pressed control,
  and deterministic pending, success and failure projections with no optimistic
  theme class or pressed state;

### Nominal and persistence

- each of six tabs has at least one real user action and one UI assertion;
- Feed, Profil, CV, Candidatures and Réglages each have a durable mutation,
  read-back and warm reload assertion;
- TJM correctly distinguishes durable history from ephemeral filtering;
- onboarding uses save, alert acknowledgement and consent, not skip;
- offline reload and online recovery preserve local data.

### Errors, cancellation and retry

- every adapter, bridge, storage, UI, reload and network-mode failure has a
  typed terminal path;
- verify `failed_cleaning` is excluded from every wildcard/generic row, accepts
  only current `CLEANUP_PROVED` or `CLEANUP_FAILED` as outgoing transitions and
  cannot retry, reallocate, recurse or consume a second `TIMEOUT`;
- offline timeout and failure enter `failed_restoring`; cancellation enters
  `cancelled_restoring`; each cleanup result repeats the exact pending effect
  tuple and preserves the original cause;
- release proofs forbid Playwright retries;
- optimistic favorite state cannot pass before storage acknowledgement;
- profile/CV/tracking save failures cannot be mistaken for success;
- no hidden reseed, clear, reset or retry occurs after preconditions.

### Permissions and boundaries

- scenarios request no optional host permission and open no external URL;
- the adapter is test-only and excluded from `dist` by an artifact test;
- the current tracking wire v1 and Settings release V1 boundaries are explicit;
- onboarding source non-persistence is not concealed;
- premium dormant behavior is not faked with a storage override.

### Determinism and capacity

- inventory byte order, both non-interchangeable digests and annotation parity
  are exact in child and parent authority;
- fixture schemas and dates are valid under current runtime decoders;
- capture normalization is canonical and bounded;
- time-dependent values use recorded intervals or browser-derived ISO, never
  wall-clock string snapshots;
- stale/duplicate/wrong-generation events cannot advance the machine;
- all loops, buffers, rows, actions, checkpoints and deadlines are bounded.

## Joint implementation and activation order after approval

The current revision permits review only. Its independent approval, together
with approvals of clarification 11, MV3 revision 26, the CV anchor and aligned
satellite models, permits entry into the non-authoritative joint implementation
phase. The required order is:

1. independently review these exact revision-11 bytes and every exact companion
   model; no review receipt alone is release authority;
2. dispatch one correlated `JOINT_IMPLEMENTATION_STARTED` event and freeze its
   phase ID, reviewed model tuples and bounded plan;
3. add RED unit/component/Playwright contract tests for inventory v2 parsing,
   strict ASCII order, duplicate/missing annotation rejection, adapter decoders,
   snapshot canonicalization, bounds, machine forbidden transitions, the
   non-interactive named MissionCard article, pressed favorite, named
   status/busy projection and controlled disclosure, the TJM named
   region/list/direct-item/heading scope, and the appearance group's
   confirmed/pending/failure semantics. The RED receipts must prove the current
   implementation fails for the intended contract reason before UI production
   code changes;
4. implement those three packaged UI-anchor contracts, then add the private
   XState scenario machine, offline child and pure closed
   scenario plans;
5. add the test-only service-worker data adapter and prove it is absent from
   `dist`;
6. implement the four Playwright scenarios with exact annotations and zero
   retries;
7. implement every parent, producer and consumer V2 reader behind the inactive
   joint phase; no consumer is independently authoritative;
8. freeze one clean implementation commit/tree and emit the ordered
   review-plus-implementation authority set;
9. materialize that commit/tree, install the immutable-source mount/capability
   boundary and closed output mounts, and reject until its pre-exec authority
   receipt passes;
10. construct the phase sandbox from that implemented set and run focused
    unit/contract tests, including forbidden transitions, stale results,
    `failed_cleaning` rejection of generic failure/cancel/timeout events, offline
    failure/cancel cleanup and CV anchor ambiguity;
11. in the same sandbox, run the canonical packaged MV3 command against a
    freshly built sealed artifact; require all scenarios to terminate
    `verified_only`, emit no release gate, and require every command receipt to
    retain the exact immutable-source and output-mount authority;
12. freeze the ordered evidence set, issue distinct verification receipts for
    every model, and construct the exact ordered verified set;
13. perform one `JOINT_AUTHORITY_ACTIVATED` catalog CAS that atomically switches
    every consumer to V2 and retains pre/post artifact digests, both inventory
    authority digests, all model receipts, checkpoint receipt hashes and
    zero-diagnostic evidence;
14. for an actual candidate, rerun the complete packaged suite from fresh
    attempts under `activated_release`; only those receipts may enter the release
    gate.

## Release gate

The extension can claim this packaged tab proof only when:

- the admitted authority tuple names this exact independently approved child
  behavior hash and exact approved/implemented/verified dependency receipts for
  MV3 harness revision 26 at behavior hash
  `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`,
  release-readiness clarification 11, this revision 11 and the CV
  accessible-anchor revision 6 at behavior hash
  `d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98`;
- one committed joint activation receipt proves clarification 11, revision 11,
  the aligned producer/consumer refinements and MV3 revision 26 were implemented
  and verified against the same clean committed V2 blob;
- the committed inventory object hashes exactly to
  `inventoryBlobSha256=b386a936abad72ccd4fe2b0dd5cdf2390a6762e3d2ce3e0b0e07635f16f6a1ef`
  and its derived ordered array hashes exactly to
  `scenarioMatrixSha256=2a9c9f67e0c19a0dae126f7db15c25a0c1411b0753e63ecad6eaa0824720f79a`;
- all four new scenario IDs execute exactly once and pass together with every
  preserved V1 scenario and exact annotation parity under
  `authorityMode:'activated_release'`; no `verified_only` receipt is present;
- every non-offline checkpoint retains correlated before, post-mutation,
  post-reload UI and post-reload persistence receipts with equal durable
  projections;
- the offline child completes its full reload/re-navigation/recovery path and
  ends online; every failed or cancelled run also has truthful correlated
  online cleanup evidence;
- CV post-reload skills are proved only inside the controlled expanded region;
- diagnostics are empty and the post-test artifact digest equals the pre-launch
  digest;
- every build/scenario command receipt binds the same immutable-source authority,
  source mount/ancestors stayed OS-read-only for the entire child process tree,
  and only the closed dependency/cache/dist/profile/report mounts were writable.

Any skipped scenario, test retry, stale inventory consumer, adapter leakage into
`dist`, promoted/re-labeled verification-only evidence,
missing/stale/mismatched/cross-role receipt, absent or partial joint
activation, digest substitution, source-hash mismatch, missing/changed mount or
capability receipt, writable source/ancestor, tracked-path shadow, overlay,
chmod/remount/symlink escape, omitted typed
checkpoint event, implicit offline transition, ambiguous CV anchor,
optimistic-only success, raw/UI divergence, diagnostic, cleanup failure or
artifact drift blocks production readiness.

## Known risks exposed by this model

1. **Harness seam gap.** The public fixture has no typed IndexedDB seed/capture
   method today. The test-only, hash-bound service-worker adapter is required
   before these scenarios can be implemented without DEV stubs.
2. **Harness revision-26 blocker.** Revision 26 at normalized behavior hash
   `da2440b21f2c901b6afe1a309121e405844d73b3bf7d679d66b3154d1208c32b`
   is only a pending candidate. Its distinct approval, implementation and
   verification receipts are required; no earlier revision or differently
   hashed implementation can substitute.
3. **Joint activation blocker.** Release-readiness clarification 11 and this
   revision 11 have no committed `JointReleaseModelActivationV1`. Approved models
   may enter only the non-authoritative joint implementation phase; no V2
   release candidate is admitted until the atomic activation CAS succeeds.
4. **CV accessible-anchor implementation blocker.** CV model revision 6 at
   behavior hash
   `d9fbcd1c8af1d806692cefe19c7e877d82a6c1807da6a64c48eaedd402dc9b98`
   has independent model approval and defines the required stable article,
   controlled expansion, callback-settlement, synchronous focus-exit port and
   nested terminal cleanup semantics. Matching implementation and verification
   receipts on the joint clean tree are still required before checkpoint A3 can
   assert post-reload skills.
5. **Diagnostic inspector blocker.** The current release-workflow inspector
   rejects the exact `test:mv3` diagnostic `upload-artifact` step. It must learn
   the closed non-candidate projection above while retaining fail-closed
   rejection of every candidate-shaped or unmodeled upload.
6. **Settings authority gap.** The broad Settings V2 model reports an incomplete
   global writer cutover. This test exercises the shipped V1 release envelope;
   it must not be cited as closure of that separate blocker.
7. **Tracking authority gap.** Packaged runtime remains on wire v1. These tests
   do not prove wire v2 ledger, CAS, restart reconciliation or data epoch rules.
8. **Onboarding source gap.** Source choice is currently ephemeral and the
   onboarding source model is not connected. If product acceptance expects the
   chosen connector to survive reload, production readiness remains blocked
   outside this scenario scope.
9. **Onboarding skip mismatch.** Current skip completion does not prove the
   target model's transactional `autoScan:false` rule. The success scenario
   avoids skip, but the mismatch remains separate debt.
10. **TJM storage documentation drift.** The storage module claims IndexedDB in
    its header while runtime uses `chrome.storage.local`. A future migration must
    update this model and fixtures atomically.
11. **Schema/version drift.** The adapter is pinned to DB5/data2 and current
    store key paths. A structural or data migration requires a new reviewed
    model revision before tests are updated.
12. **Packaged UI-anchor implementation blocker.** Current MissionCard has an
    interactive `role=button` root containing nested buttons and no closed
    named status settlement group; current TJM insights are generic `div`
    elements without list items/headings; and current theme controls expose no
    named group, pressed state or pending disable/busy contract. Checkpoints A1,
    B2 and B3 above close those semantics. Their exact implementation and
    verification receipts are required before the packaged scenarios can run;
    ad-hoc test IDs, positional selectors and page-global absence assertions
    remain forbidden.
13. **Local timezone.** `datetime-local` conversion depends on the browser
    timezone. Capturing the page-derived expected ISO avoids a Europe/Paris
    snapshot assumption, but browser timezone drift must still be retained in
    evidence.
14. **Offline harness seam.** The fixture exposes the Playwright page but no
    typed network-mode capability. Implementation must wrap the current
    `BrowserContext.setOffline` call in the closed commands modeled here and
    prove online cleanup; synthetic page events are not an acceptable fallback.
15. **Missing dedicated TJM workflow model.** TJM has pure analysis code and a
    storage adapter but no standalone state/workflow model. This document owns
    only the packaged read/filter/reload proof; a future TJM mutation workflow
    requires its own Model -> Review gate.
16. **CV/availability concurrency debt.** The packaged add-experience checkpoint
    is sequential and does not close the reported race between CV or
    availability saves and active sync/push loops. That race remains a separate
    production-readiness risk.
17. **Generated asset linkage debt.** Generated assets persist independently,
    while current generation does not reliably append their IDs to
    `MissionTracking.generatedAssetIds`. These scenarios neither exercise nor
    conceal that gap.
