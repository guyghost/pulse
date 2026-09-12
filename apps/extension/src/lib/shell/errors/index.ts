/**
 * Shell error-handling module exports
 *
 * This module contains the I/O logic for error handling:
 * - Console logging
 * - Sending to a monitoring service
 * - Displaying toasts
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
