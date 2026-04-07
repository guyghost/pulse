/**
 * Exports du système d'erreurs
 */

// Types et interfaces
export type {
  BaseAppError,
  ErrorType,
  NetworkError,
  StorageError,
  ParsingError,
  ConnectorError,
  ValidationError,
  AppError,
} from './app-error';

// Type guards
export {
  isNetworkError,
  isStorageError,
  isParsingError,
  isConnectorError,
  isValidationError,
  isRetryable,
  isFatal,
  serializeError,
  deserializeError,
} from './app-error';

// Factory functions
export {
  createNetworkError,
  createStorageError,
  createParsingError,
  createConnectorError,
  createValidationError,
} from './app-error';

// Result type et helpers
export type { Ok, Err, Result } from './result';
export {
  ok,
  err,
  isOk,
  isErr,
  map,
  flatMap,
  mapErr,
  unwrapOr,
  unwrap,
  unwrapOptional,
  match,
  all,
  any,
} from './result';
