/**
 * Pattern Result<T, E> inspiré de Rust
 * 
 * Permet une gestion d'erreurs explicite sans exceptions
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

/** Résultat succès */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Résultat erreur */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Union Result<T, E> */
export type Result<T, E = AppError> = Ok<T> | Err<E>;

/** Crée un résultat succès */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Crée un résultat erreur */
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

/** Transforme la valeur en cas de succès */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/** Transforme la valeur en cas de succès avec une fonction pouvant échouer */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/** Transforme l'erreur en cas d'échec */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (result.ok) {
    return result;
  }
  return err(fn(result.error));
}

/** Récupère la valeur ou une valeur par défaut */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/** Récupère la valeur ou lance une exception */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`Called unwrap on Err: ${JSON.stringify(result.error)}`);
}

/** Récupère la valeur ou undefined */
export function unwrapOptional<T, E>(result: Result<T, E>): T | undefined {
  return result.ok ? result.value : undefined;
}

/** Exécute un callback selon le cas */
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
