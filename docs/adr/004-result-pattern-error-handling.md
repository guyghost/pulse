# ADR-004: Result Pattern for Error Handling

## Status
Accepted

## Context
Chrome extensions communicate across contexts via `postMessage`, which cannot serialize `Error` objects or stack traces. Traditional try/catch loses error context at serialization boundaries. We also wanted errors to be values that flow through the system predictably, not thrown exceptions that bypass control flow.

## Decision
Adopt a Rust-inspired `Result<T, E>` pattern defined in `src/lib/core/errors/result.ts`:

```typescript
type Result<T, E = AppError> = Ok<T> | Err<E>;
```

With utility functions: `ok()`, `err()`, `map()`, `flatMap()`, `mapErr()`, `unwrapOr()`, `match()`, `all()`, `any()`.

### AppError Type Hierarchy
`src/lib/core/errors/app-error.ts` defines a discriminated union with 5 error types:
- `NetworkError` -- HTTP failures, with `status`, `url`, `retryable` fields
- `StorageError` -- IndexedDB/chrome.storage failures, with `operation` and `key`
- `ParsingError` -- HTML/JSON parse failures, with `source` and raw data
- `ConnectorError` -- connector-level failures, with `connectorId` and `phase`
- `ValidationError` -- Zod/type-guard failures, with `field`, `expected`, `received`

All errors are plain readonly objects (no class instances), making them serializable via `postMessage`. Factory functions (`createNetworkError`, etc.) enforce correct structure. Timestamp is injected (not `Date.now()`) to keep Core pure.

### Integration
Every connector method returns `Result`. Storage operations validate on read. The Shell error handler converts `AppError` into user-facing toasts based on error type and recoverability.

## Consequences
- **Positive**: Errors are first-class values. No silent swallowing, no unexpected throws. TypeScript forces handling both cases.
- **Positive**: Serializable across Chrome contexts without data loss.
- **Positive**: `isRetryable()` and `isFatal()` enable systematic retry/abort decisions.
- **Negative**: More verbose than try/catch for simple cases. Every caller must check `.ok`.
- **Negative**: No stack traces in AppError (trade-off for serializability).
