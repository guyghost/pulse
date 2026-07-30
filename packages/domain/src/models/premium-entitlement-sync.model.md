# Premium Entitlement Sync Model

## Authority

The server profile is authoritative. The extension stores only a display
snapshot plus an ephemeral session bearer. Neither `premium_enabled` nor any
local/dev flag can authorize the Copilot API.

## States

```text
unlinked -- LINK_REQUESTED --> linking
linking -- LINK_SUCCEEDED --> checking
linking -- LINK_CANCELLED --> unlinked
linking -- LINK_FAILED --> error

free|active|expired|revoked|error -- SYNC_REQUESTED --> checking
checking -- ENTITLEMENT_FREE --> free
checking -- ENTITLEMENT_ACTIVE --> active
checking -- ENTITLEMENT_EXPIRED --> expired
checking -- ENTITLEMENT_REVOKED --> revoked
checking -- SESSION_REJECTED --> unlinked
checking -- SYNC_FAILED --> error

active -- LOCAL_EXPIRY_OBSERVED --> expired
free|active|expired|revoked|error -- UNLINK_REQUESTED --> unlinked
```

`LOCAL_EXPIRY_OBSERVED` only removes access early. It cannot create or extend
access. There is no automatic retry transition; the Shell schedules and emits
an explicit `SYNC_REQUESTED`.

## Invariants

1. Only `active` permits remote Copilot admission.
2. `active` requires a server-issued snapshot with `subject`, `issuedAt` and a
   future `expiresAt`.
3. Every response is correlated to the active `requestId`; stale responses are
   ignored.
4. Revocation and expiry remove Copilot creation authority but retain a valid
   bearer for owner-scoped inspect/cancel/review/delete recovery. Only explicit
   unlink or server session rejection clears identity.
5. Errors fail closed and never reuse the legacy Premium boolean.
6. Dev overrides can render synthetic UI but cannot reach a production API.

## Review Coverage

- Nominal link and refresh.
- Cancelled popup, denied login and invalid callback.
- Free, expiry while open, server revocation and malformed response.
- Offline/error then explicit retry.
- Old response arriving after unlink or a newer sync.
- MV3 worker restart with and without `chrome.storage.session` state.
