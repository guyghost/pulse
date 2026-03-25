# Context: Cross-Browser Compatibility

## Objective
Guarantee connector data availability across all Chromium-based browsers (Chrome, Dia/Arc, Edge, Brave, Opera, Vivaldi). Fix Collective and Free-Work connectors that return no data on non-Chrome browsers.

## Constraints
- Platform: Chrome Extension (Manifest V3)
- Architecture: FC&IS — browser detection is pure Core, strategy selection is Shell
- Browsers: Chrome, Dia/Arc, Edge, Brave, Opera, Vivaldi
- No backend, local-first

## Root Causes
1. `credentials: 'include'` in `fetch()` from extension context doesn't reliably forward cookies on non-Chrome Chromium browsers
2. Cookie partitioning/tracking protection in non-Chrome browsers affects `chrome.cookies.getAll()` results
3. `chrome-extension://` Origin header handled differently across browsers, causing CORS rejections
4. Free-Work (public API) was using `credentials: 'include'` unnecessarily, triggering CORS preflight failures
5. `declarativeNetRequest` cookie injection can fail on browsers with cookie partitioning

## Strategy
- **Browser detection** (Core, pure): `detectBrowser(userAgent)` classifies browser + capabilities
- **Cookie injection hardening** (Shell): `verifyCookieRule()` confirms injection worked, diagnostic logging
- **Fallback session detection** (Shell): If cookies empty, try API anyway (Collective)
- **Public API fix** (Shell): `credentials: 'omit'` for Free-Work, Origin rewriting via `declarativeNetRequest`

## Technical Decisions
| Decision | Justification | Agent |
|----------|---------------|-------|
| Pure browser detection in Core | FC&IS: takes userAgent string, returns BrowserInfo — no I/O | @codegen |
| `needsExplicitCookieInjection()` per browser | Non-Chrome Chromium browsers need explicit cookie injection via declarativeNetRequest | @codegen |
| `needsOriginRewrite()` returns true for all Chromium | All Chromium extensions send `chrome-extension://` as Origin which gets blocked | @codegen |
| Free-Work uses `credentials: 'omit'` | Public API, no auth needed — avoids CORS preflight issues | @codegen |
| `verifyCookieRule()` with diagnostic logging | Detect silently-dropped cookie injection rules across browsers | @codegen |
| Fallback: try API even if cookies empty | On non-Chrome browsers, cookies may not appear via `chrome.cookies.getAll()` but may still be sent | @codegen |

## Artifacts Produced
| File | Agent | Status |
|------|-------|--------|
| `src/lib/core/browser/browser-compat.ts` | @codegen | ✅ Created — Pure browser detection |
| `tests/unit/browser/browser-compat.test.ts` | @tests | ✅ Created — 33 tests |
| `tests/unit/connectors/cookie-rules.test.ts` | @tests | ✅ Created — 23 tests |
| `src/lib/shell/connectors/cookie-rules.ts` | @codegen | ✅ Updated — Added CookieRuleResult, verifyCookieRule, getCookieCount, getCookieNames |
| `src/lib/shell/connectors/collective.connector.ts` | @codegen | ✅ Updated — Fallback session detection, verifyCookieRule, browser info in errors |
| `src/lib/shell/connectors/freework.connector.ts` | @codegen | ✅ Updated — credentials: 'omit' for public API |
| `src/lib/shell/connectors/base.connector.ts` | @codegen | ✅ Updated — getBrowserInfo() lazy singleton, browser name in error context |
| `src/background/index.ts` | @codegen | ✅ Updated — Origin/Referer rewriting rule (ID 3) for free-work.com/api |

## Test Results
- **605 tests pass across 41 test files**
- TypeScript compiles with zero errors
- No regressions

## Validation
- FC&IS compliance validated — Core has no I/O, Shell imports Core correctly
- One minor issue found and fixed: unused `type BrowserInfo` import in collective.connector.ts

## Status: ✅ COMPLETE
