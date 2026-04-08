/**
 * Exports du module de gestion d'erreurs Shell
 *
 * Ce module contient la logique I/O pour la gestion d'erreurs:
 * - Logging console
 * - Envoi à un service de monitoring
 * - Affichage de toasts
 */

export {
  handleError,
  isRetryable,
  configureErrorHandler,
  getErrorHandlerConfig,
  subscribeToToasts,
  shouldIgnoreError,
  withErrorHandling,
  withErrorHandlingAsync,
} from './error-handler';

export type { ToastMessage } from './error-handler';

export {
  recordError,
  persistErrors,
  getErrorLog,
  clearErrorLog,
  getErrorSummary,
} from './error-analytics';

export type { ErrorLogEntry, ErrorSummary } from './error-analytics';
