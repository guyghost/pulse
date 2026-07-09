# Onboarding — Work-Mode & Location Fields Model

Source of truth for the onboarding profile-collection fields that capture
**where** a freelancer wants to work (location) and **how** (work mode / remote).
Companion to `profile-state.model.md` (persistence lifecycle) and
`keywords-unification.model.md` (keyword collection). Proposed change captured
here pending implementation; the `UserProfile` schema already supports every
field — this change only fixes what onboarding **collects**.

## Problem

`OnboardingWizard.svelte` conflates the two concepts today:

- A single `location` text field with placeholder `ex: Paris ou remote` mixes a
  place with a work arrangement, so users type either/or and the signal is
  ambiguous for the location scorer (`core/scoring/location-matching.ts`).
- `remote` is **hardcoded to `'any'`** in `handleComplete()`. The work-mode
  preference is never collected at first run, even though `UserProfile.remote`
  (`RemoteType | 'any'`, where `RemoteType = 'full' | 'hybrid' | 'onsite'`) and
  the `remote` scoring weight (`DEFAULT_SCORING_WEIGHTS.remote = 15`) exist.

The profile edit surface (`ProfileSection.svelte`) already exposes two distinct
fields — a `profileLocation` text input and a `profileRemote` select with
options `Indifférent / Remote / Hybride / Présentiel`. Onboarding must match
that separation so first-run data feeds the same scorer with the same shape.

## Fields

| Field           | Profile key | Type                  | Onboarding control         | Default | Required |
| --------------- | ----------- | --------------------- | -------------------------- | ------- | -------- |
| Localisation    | `location`  | `string`              | Text input (location only) | `''`    | No       |
| Mode de travail | `remote`    | `RemoteType \| 'any'` | Segmented control (4 opts) | `'any'` | No       |

Work-mode options (values and labels **identical** to `ProfileSection.remoteOptions`):

| value      | label       |
| ---------- | ----------- |
| `'any'`    | Indifférent |
| `'full'`   | Remote      |
| `'hybrid'` | Hybride     |
| `'onsite'` | Présentiel  |

`'any'` is the explicit "no preference" value already used everywhere `remote`
is optional; it must remain the default so onboarding stays opt-in and the
existing `withProfileDefaults` fallback is unchanged.

## States (per field, local to the wizard)

```
location:  untouched ('') ──input──► filled (string) ──clear──► untouched
remote:    untouched ('any') ──select──► chosen (full|hybrid|onsite) ──select 'any'──► 'any'
```

Both fields are always "valid" — there is no error state for them. They are
optional and never block `canSubmit`.

## Events

| Event                  | Source              | Effect                                                              |
| ---------------------- | ------------------- | ------------------------------------------------------------------- |
| `LOCATION_INPUT`       | location text input | `location` state updated                                            |
| `REMOTE_SELECT(value)` | segmented control   | `remote` state updated to `value`                                   |
| `SUBMIT`               | "Sauvegarder" btn   | build draft via `normalizeProfileDraft({ …, location, remote, … })` |

On `SUBMIT` the wizard calls `onUpdateProfile(profile)` then `onComplete(profile)`,
exactly as today — only the `remote` value stops being hardcoded.

## Data flow

```
OnboardingWizard (local $state: location, remote)
   │  SUBMIT
   ▼
normalizeProfileDraft({ firstName, jobTitle, location, remote, keywords, tjmMin, tjmMax, seniority })
   │  (pure — already accepts `remote`, defaults to 'any')
   ▼
UserProfile  ──onUpdateProfile──►  OnboardingPage.profileDraft  ──PROFILE_UPDATED──► profile store
   │
   └──onComplete──► profile store.SUBMIT_PROFILE ──save()──► IndexedDB
                                                          │
                                                          ▼
                          scoring: relevance.ts uses location (matchLocation) + remote weight
```

No new message types, no bridge change, no schema change. `normalizeProfileDraft`
and `withProfileDefaults` already handle `remote` and `location`.

## Invariants

1. **Separation.** `location` carries a place only; `remote` carries the work
   arrangement only. The location placeholder must not suggest "remote" as a
   location value.
2. **Vocabulary parity.** Work-mode values/labels in onboarding are byte-for-byte
   the same set as `ProfileSection.remoteOptions`. The filter bar
   (`FilterBar.remoteTypes`) uses a different label set (`Full remote / Hybride /
Sur site`) because it is a mission filter, not a profile preference — that
   inconsistency is intentional and out of scope here.
3. **Default safety.** A skipped or untouched work mode resolves to `'any'`;
   an untouched location resolves to `''`. Both pass through
   `withProfileDefaults` unchanged.
4. **No scoring change.** This change adds a collected signal; it does not alter
   `relevance.ts`, `location-matching.ts`, or `DEFAULT_SCORING_WEIGHTS`.
5. **canSubmit unchanged.** Submission still requires `firstName`, `jobTitle`,
   and ≥1 keyword. Work mode and location remain optional.

## Edge cases & migration

- **Existing profiles** stored with `remote: 'any'` (the only value onboarding
  could ever produce): unchanged. No DB migration, no preprocessor change.
- **User selects 'Indifférent'**: `remote === 'any'` — identical to today's
  hardcoded behavior; scoring treats it as "no remote preference."
- **Location left empty, work mode chosen**: valid; remote weight still applies,
  location weight contributes 0 for that profile (existing behavior).
- **Browser autofill / long city names** ("Charenton-le-Pont"): the text input
  must not truncate; existing input styling already handles this.
- **Keyboard selection** of the segmented control: each option is a real
  `<button>` with `aria-pressed`, reachable via Tab, activatable via
  Space/Enter — keyboard-first is a stated accessibility principle.

## UI mapping

- **Localisation** field: placeholder changes from `ex: Paris ou remote` to a
  place-only example (e.g. `Paris, Lyon, Bordeaux…`). Label stays
  `Localisation souhaitée`.
- **Mode de travail** field: new, placed immediately after Localisation
  (where → how grouping). Segmented control, 4 options, full-width, default
  `Indifférent`. Reuses the wizard's existing chip/selected vocabulary and
  `blueprint-blue` accent so it reads as part of the same surface, not a
  new component library.
- Both fields keep the existing onboarding input styling (border, focus ring,
  radius) — no new design tokens.

## Out of scope

- Structured location picker (datalist / geocoding). Location stays free text;
  `location-matching.ts` already normalizes synonyms and metro areas.
- Changing `ProfileSection` or `FilterBar` vocabulary.
- Adding `remote` to the connected alert preferences (alerts are TJM + stack
  keyed today).
- Reordering onboarding steps or altering the 5-step tour.
