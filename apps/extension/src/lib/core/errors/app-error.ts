/**
 * Système d'erreurs typé pour MissionPulse
 * 
 * Règles:
 * - Core = pure, pas d'I/O (pas de console.log, pas de Date.now())
 * - Les erreurs sont sérialisables (pour postMessage)
 * - Timestamp injecté depuis Shell
 */

// ============================================================================
// Types de base
// ============================================================================

export type ErrorType = 
  | 'network'
  | 'storage'
  | 'parsing'
  | 'connector'
  | 'validation';

export interface BaseAppError {
  readonly type: ErrorType;
  readonly message: string;
  readonly recoverable: boolean;
  readonly context?: Record<string, unknown>;
  readonly timestamp: number;
}

// ============================================================================
// Erreurs spécifiques (discriminating union)
// ============================================================================

export interface NetworkError extends BaseAppError {
  readonly type: 'network';
  readonly status?: number;
  readonly url?: string;
  readonly retryable: boolean;
}

export interface StorageError extends BaseAppError {
  readonly type: 'storage';
  readonly operation: 'read' | 'write' | 'delete' | 'clear';
  readonly key?: string;
}

export interface ParsingError extends BaseAppError {
  readonly type: 'parsing';
  readonly source: string;
  readonly raw?: string;
}

export interface ConnectorError extends BaseAppError {
  readonly type: 'connector';
  readonly connectorId: string;
  readonly phase: 'detect' | 'fetch' | 'parse';
}

export interface ValidationError extends BaseAppError {
  readonly type: 'validation';
  readonly field?: string;
  readonly expected?: string;
  readonly received?: unknown;
}

/** Union discriminating de toutes les erreurs applicatives */
export type AppError = 
  | NetworkError
  | StorageError
  | ParsingError
  | ConnectorError
  | ValidationError;

// ============================================================================
// Type guards
// ============================================================================

export function isNetworkError(error: AppError): error is NetworkError {
  return error.type === 'network';
}

export function isStorageError(error: AppError): error is StorageError {
  return error.type === 'storage';
}

export function isParsingError(error: AppError): error is ParsingError {
  return error.type === 'parsing';
}

export function isConnectorError(error: AppError): error is ConnectorError {
  return error.type === 'connector';
}

export function isValidationError(error: AppError): error is ValidationError {
  return error.type === 'validation';
}

// ============================================================================
// Factory functions
// ============================================================================

interface NetworkErrorOptions {
  status?: number;
  url?: string;
  retryable?: boolean;
  context?: Record<string, unknown>;
}

export function createNetworkError(
  message: string,
  options: NetworkErrorOptions,
  timestamp: number
): NetworkError {
  return {
    type: 'network',
    message,
    recoverable: options.retryable ?? true,
    retryable: options.retryable ?? true,
    status: options.status,
    url: options.url,
    context: options.context,
    timestamp,
  };
}

interface StorageErrorOptions {
  operation: 'read' | 'write' | 'delete' | 'clear';
  key?: string;
  context?: Record<string, unknown>;
}

export function createStorageError(
  message: string,
  options: StorageErrorOptions,
  timestamp: number
): StorageError {
  return {
    type: 'storage',
    message,
    recoverable: true,
    operation: options.operation,
    key: options.key,
    context: options.context,
    timestamp,
  };
}

interface ParsingErrorOptions {
  source: string;
  raw?: string;
  context?: Record<string, unknown>;
}

export function createParsingError(
  message: string,
  options: ParsingErrorOptions,
  timestamp: number
): ParsingError {
  return {
    type: 'parsing',
    message,
    recoverable: false,
    source: options.source,
    raw: options.raw,
    context: options.context,
    timestamp,
  };
}

interface ConnectorErrorOptions {
  connectorId: string;
  phase: 'detect' | 'fetch' | 'parse';
  recoverable?: boolean;
  context?: Record<string, unknown>;
}

export function createConnectorError(
  message: string,
  options: ConnectorErrorOptions,
  timestamp: number
): ConnectorError {
  return {
    type: 'connector',
    message,
    recoverable: options.recoverable ?? false,
    connectorId: options.connectorId,
    phase: options.phase,
    context: options.context,
    timestamp,
  };
}

interface ValidationErrorOptions {
  field?: string;
  expected?: string;
  received?: unknown;
  context?: Record<string, unknown>;
}

export function createValidationError(
  message: string,
  options: ValidationErrorOptions,
  timestamp: number
): ValidationError {
  return {
    type: 'validation',
    message,
    recoverable: false,
    field: options.field,
    expected: options.expected,
    received: options.received,
    context: options.context,
    timestamp,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Détermine si une erreur est retryable (pour la logique de retry) */
export function isRetryable(error: AppError): boolean {
  if (error.type === 'network') {
    return error.retryable;
  }
  return error.recoverable;
}

/** Détermine si une erreur est fatale (non recoverable) */
export function isFatal(error: AppError): boolean {
  return !error.recoverable;
}

/** Convertit une erreur en objet plain sérialisable (pour postMessage) */
export function serializeError(error: AppError): Record<string, unknown> {
  return {
    type: error.type,
    message: error.message,
    recoverable: error.recoverable,
    context: error.context,
    timestamp: error.timestamp,
    // Type-specific fields
    ...(error.type === 'network' && {
      status: error.status,
      url: error.url,
      retryable: error.retryable,
    }),
    ...(error.type === 'storage' && {
      operation: error.operation,
      key: error.key,
    }),
    ...(error.type === 'parsing' && {
      source: error.source,
      raw: error.raw,
    }),
    ...(error.type === 'connector' && {
      connectorId: error.connectorId,
      phase: error.phase,
    }),
    ...(error.type === 'validation' && {
      field: error.field,
      expected: error.expected,
      received: error.received,
    }),
  };
}

/** Reconstruit une erreur depuis un objet sérialisé (après postMessage) */
export function deserializeError(data: Record<string, unknown>): AppError {
  const base = {
    message: String(data.message),
    recoverable: Boolean(data.recoverable),
    context: data.context as Record<string, unknown> | undefined,
    timestamp: Number(data.timestamp),
  };

  switch (data.type) {
    case 'network':
      return {
        ...base,
        type: 'network',
        status: data.status as number | undefined,
        url: data.url as string | undefined,
        retryable: data.retryable as boolean,
      };
    case 'storage':
      return {
        ...base,
        type: 'storage',
        operation: data.operation as 'read' | 'write' | 'delete' | 'clear',
        key: data.key as string | undefined,
      };
    case 'parsing':
      return {
        ...base,
        type: 'parsing',
        source: data.source as string,
        raw: data.raw as string | undefined,
      };
    case 'connector':
      return {
        ...base,
        type: 'connector',
        connectorId: data.connectorId as string,
        phase: data.phase as 'detect' | 'fetch' | 'parse',
      };
    case 'validation':
      return {
        ...base,
        type: 'validation',
        field: data.field as string | undefined,
        expected: data.expected as string | undefined,
        received: data.received,
      };
    default:
      throw new Error(`Unknown error type: ${data.type}`);
  }
}
