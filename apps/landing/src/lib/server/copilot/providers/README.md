# Eve provider boundary

This provider uses Eve 0.26.2 only through its public server client. `start()` consumes
`send().result()` and returns a final, schema-validated result; no event stream crosses the
provider port. Each turn has a validated deadline (60 seconds by default, 1–120 seconds
allowed). A timeout is an uncertain provider outcome and must be reconciled before any retry
or credit mutation.

Eve's cancellation response confirms only that cooperative cancellation was accepted. The
provider therefore returns `running`, never a fabricated terminal `cancelled` state.

Eve 0.26.2 does not expose a public durable job lookup API or a public session deletion API.
`get()` and `deleteSession()` therefore fail with typed unsupported errors instead of
inventing success. Durable reconciliation and a reviewed retention/deletion mechanism remain
production gates for the pilot.

This slice deliberately sets `configureVercelJson: false` so builds cannot mutate deployment
topology. The equivalent reviewed topology is committed explicitly in `apps/landing/vercel.json`:
SvelteKit and Eve are sibling services and `/eve/v1/**` is rewritten to Eve's private service
prefix. `MISSIONPULSE_EVE_BASE_URL` remains an explicit production override; local development
also accepts the `EVE_BASE_URL` injected by the official SvelteKit plugin.

The extension-facing API uses the cookieless `copilot.missionpulse.app` custom domain while
account linking stays on `missionpulse.app`. Both domains must target this SvelteKit project in
Vercel. DNS and custom-domain attachment are deployment prerequisites and cannot be established
from this repository.

The canonical Eve HTTP channel accepts only Vercel OIDC service identity in deployment and
the framework's local-development identity on loopback. It does not enable browser CORS, so
the Chrome extension cannot call Eve directly.
