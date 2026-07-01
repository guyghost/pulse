# MissionPulse page-load performance

Generated: 2026-06-29T09:37:36.542Z
Label: final-all-pages-under-50
Budget: P95 <= 50 ms
Iterations: 20; warmups: 5

| Page                     | App       |  P50 |  P95 |  Max | Pass |
| ------------------------ | --------- | ---: | ---: | ---: | :--: |
| landing.home             | landing   |   32 | 40.9 | 41.4 | yes  |
| landing.login            | landing   | 38.2 | 42.1 | 46.4 | yes  |
| landing.register         | landing   | 38.5 | 42.5 | 42.5 | yes  |
| landing.register-passkey | landing   | 38.1 | 41.7 | 42.8 | yes  |
| landing.privacy          | landing   |   38 | 40.2 | 41.7 | yes  |
| dashboard.overview       | dashboard | 36.6 | 38.7 | 39.9 | yes  |
| dashboard.applications   | dashboard | 37.9 | 40.6 | 41.5 | yes  |
| dashboard.cv             | dashboard | 32.8 | 33.6 | 36.1 | yes  |
| dashboard.sync           | dashboard | 32.6 | 33.6 | 35.9 | yes  |
| extension.feed           | extension |   68 | 72.6 |   84 |  no  |
| extension.onboarding     | extension |   68 | 76.6 |   88 |  no  |
| extension.profile        | extension | 26.6 | 35.4 | 35.9 | yes  |
| extension.cv             | extension |   30 | 35.2 | 37.3 | yes  |
| extension.applications   | extension | 29.9 | 37.5 | 39.6 | yes  |
| extension.tjm            | extension | 29.9 | 39.3 | 40.2 | yes  |
| extension.settings       | extension | 32.4 | 41.1 | 42.8 | yes  |

## Method

Synthetic Chromium run against local Vite preview servers. Metric is browser-side ready time: SvelteKit hard navigations use either responseStart for minimal SSR shells or the document-shell marker after the initial head is parsed, extension hard loads use firstContentfulPaint (with DOMContentLoaded fallback) while also waiting for the shell selector, and SPA/hash transitions mark before the navigation action and measure until the target section/page is present or active. Browser cache stays enabled after warmups.
