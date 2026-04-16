/**
 * Error Boundary — Wrapper générique pour les handlers de messages bridge.
 *
 * Garantit :
 *  - Isolation : une erreur dans un handler n'affecte pas les autres
 *  - Classification : VALIDATION_ERROR | CONNECTOR_ERROR | STORAGE_ERROR | UNKNOWN
 *  - Logging structuré : type de message, contexte sender, chemin d'erreur Zod
 *
 * Shell only — pas d'import Core.
 */

import { validateMessage } from './schemas';

// ============================================================================
// Types
// ============================================================================

export type ErrorCategory =
  | 'VALIDATION_ERROR'
  | 'CONNECTOR_ERROR'
  | 'STORAGE_ERROR'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNKNOWN';

export interface BoundaryErrorResponse {
  success: false;
  error: {
    code: ErrorCategory;
    message: string;
  };
}

export interface BoundarySuccessResponse<T = unknown> {
  success: true;
  data?: T;
}

export type BoundaryResponse<T = unknown> = BoundarySuccessResponse<T> | BoundaryErrorResponse;

// ============================================================================
// Error classification
// ============================================================================

export function classifyError(err: unknown): ErrorCategory {
  if (!(err instanceof Error)) return 'UNKNOWN';

  const msg = err.message.toLowerCase();
  const name = err.name.toLowerCase();

  if (name.includes('connector') || msg.includes('connector') || msg.includes('scrape')) {
    return 'CONNECTOR_ERROR';
  }
  if (
    msg.includes('quota') ||
    msg.includes('indexeddb') ||
    msg.includes('storage') ||
    name.includes('domexception')
  ) {
    return 'STORAGE_ERROR';
  }
  if (msg.includes('payload') && msg.includes('large')) {
    return 'PAYLOAD_TOO_LARGE';
  }
  return 'UNKNOWN';
}

// ============================================================================
// withErrorBoundary
// ============================================================================

type SendResponse = (response: unknown) => void;
type MessageHandler = (
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse
) => void | boolean | Promise<void>;

/**
 * Wraps a message handler with :
 *  1. Input validation (Zod schemas)
 *  2. Error boundary (catch + classify)
 *  3. Structured logging in dev mode
 *
 * @param handler       The raw handler function
 * @param messageType   Message type string for logging context
 * @returns A chrome.runtime.onMessage-compatible listener
 */
export function withErrorBoundary(
  handler: MessageHandler,
  messageType: string
): (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse
) => boolean | void {
  return (raw: unknown, sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
    // ── 1. Validate ────────────────────────────────────────────────────────
    const validation = validateMessage(raw);

    if (!validation.valid) {
      const response: BoundaryErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.errors.join('; '),
        },
      };

      if (import.meta.env.DEV) {
        console.warn(
          `[ErrorBoundary] Validation failed for "${validation.messageType ?? 'unknown'}"`,
          {
            errors: validation.errors,
            sender: sender.id ?? sender.tab?.id,
          }
        );
      }

      sendResponse(response);
      return false; // Synchronous — no async channel needed
    }

    // ── 2. Execute handler with error boundary ─────────────────────────────
    try {
      const result = handler(
        validation.message as Record<string, unknown>,
        sender,
        sendResponse
      );

      // Handler is async (returns true to keep the channel open)
      if (result === true || result instanceof Promise) {
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            const category = classifyError(err);
            const message = err instanceof Error ? err.message : String(err);

            if (import.meta.env.DEV) {
              console.error(`[ErrorBoundary] Async error in "${messageType}"`, {
                category,
                message,
                sender: sender.id ?? sender.tab?.id,
              });
            }

            sendResponse({
              success: false,
              error: { code: category, message },
            } satisfies BoundaryErrorResponse);
          });
        }
        return true; // Keep channel open for async response
      }

      return result;
    } catch (err: unknown) {
      // ── 3. Sync error ──────────────────────────────────────────────────
      const category = classifyError(err);
      const message = err instanceof Error ? err.message : String(err);

      if (import.meta.env.DEV) {
        console.error(`[ErrorBoundary] Sync error in "${messageType}"`, {
          category,
          message,
          sender: sender.id ?? sender.tab?.id,
        });
      }

      sendResponse({
        success: false,
        error: { code: category, message },
      } satisfies BoundaryErrorResponse);

      return false;
    }
  };
}
