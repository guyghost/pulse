/**
 * Rust-inspired Result<T, E> pattern
 *
 * Enables explicit error handling without exceptions
 *
 * Usage:
 *   function mayFail(): Result<string, AppError> {
 *     if (success) return ok("value");
 *     return err(createNetworkError(...));
 *   }
 *
 *   const result = mayFail();
 *   if (result.ok) {
 *     console.log(result.value);
 *   } else {
 *     console.error(result.error);
 *   }
 */

import type { AppError } from './app-error';

/** Successful result */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Error result */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Result<T, E> union */
export type Result<T, E = AppError> = Ok<T> | Err<E>;

/** Creates a successful result */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Creates an error result */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard pour Ok */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/** Type guard pour Err */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

/** Transforms the value on success */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/** Transforms the value on success with a fallible function */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/** Transforms the error on failure */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (result.ok) {
    return result;
  }
  return err(fn(result.error));
}

/** Returns the value or a default */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/** Returns the value or throws */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`Called unwrap on Err: ${JSON.stringify(result.error)}`);
}

/** Returns the value or undefined */
export function unwrapOptional<T, E>(result: Result<T, E>): T | undefined {
  return result.ok ? result.value : undefined;
}

/** Invokes a callback depending on the case */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => U;
    err: (error: E) => U;
  }
): U {
  if (result.ok) {
    return handlers.ok(result.value);
  }
  return handlers.err(result.error);
}

/** Combine plusieurs Results - retourne le premier Err ou un Ok avec tous les valeurs */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (result.ok) {
      values.push(result.value);
    } else {
      return result;
    }
  }
  return ok(values);
}

/** Retourne le premier Ok ou le dernier Err */
export function any<T, E>(results: Result<T, E>[]): Result<T, E> {
  let lastError: Err<E> | undefined;
  for (const result of results) {
    if (result.ok) {
      return result;
    }
    lastError = result;
  }
  return lastError ?? err(undefined as unknown as E);
}
