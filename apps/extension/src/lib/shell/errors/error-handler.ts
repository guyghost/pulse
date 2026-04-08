/**
 * Gestionnaire d'erreurs - Shell
 *
 * Ce module contient la logique I/O pour la gestion d'erreurs:
 * - Logging console
 * - Envoi à un service de monitoring (si configuré)
 * - Affichage de toasts
 *
 * Règle: Core = pure, Shell = I/O autorisé
 */

import {
  type AppError,
  type ConnectorError,
  isRetryable as isRetryableError,
  serializeError,
  isNetworkError,
  isStorageError,
  isParsingError,
  isConnectorError,
} from '$lib/core/errors';
import { recordError } from './error-analytics';

// ============================================================================
// Configuration
// ============================================================================

interface ErrorHandlerConfig {
  /** URL du service de monitoring (ex: Sentry, LogRocket) */
  monitoringUrl?: string;
  /** Activer les toasts d'erreur */
  enableToasts: boolean;
  /** Niveau de log minimum pour la console */
  consoleLogLevel: 'debug' | 'info' | 'warn' | 'error';
}

let config: ErrorHandlerConfig = {
  enableToasts: true,
  consoleLogLevel: 'debug',
};

/** Configure le gestionnaire d'erreurs */
export function configureErrorHandler(newConfig: Partial<ErrorHandlerConfig>): void {
  config = { ...config, ...newConfig };
}

/** Récupère la configuration actuelle */
export function getErrorHandlerConfig(): ErrorHandlerConfig {
  return { ...config };
}

// ============================================================================
// Gestion principale
// ============================================================================

/**
 * Gère une erreur applicative
 * - Log en console avec contexte
 * - Envoi au service de monitoring si configuré
 * - Affiche toast si nécessaire
 */
export function handleError(error: AppError): void {
  // 1. Log en console avec le niveau approprié
  logToConsole(error);

  // 1b. Enregistrement dans l'analytics locale
  recordError(error);

  // 2. Envoi au service de monitoring si configuré
  if (config.monitoringUrl) {
    sendToMonitoring(error);
  }

  // 3. Affichage toast si activé et erreur visible par l'utilisateur
  if (config.enableToasts && shouldShowToast(error)) {
    showToast(error);
  }
}

/** Détermine si une erreur est retryable */
export function isRetryable(error: AppError): boolean {
  return isRetryableError(error);
}

// ============================================================================
// Logging console
// ============================================================================

function logToConsole(error: AppError): void {
  const logData = {
    type: error.type,
    message: error.message,
    recoverable: error.recoverable,
    timestamp: new Date(error.timestamp).toISOString(),
    context: error.context,
    // Type-specific details
    ...(isNetworkError(error) && {
      status: error.status,
      url: error.url,
      retryable: error.retryable,
    }),
    ...(isStorageError(error) && {
      operation: error.operation,
      key: error.key,
    }),
    ...(isParsingError(error) && {
      source: error.source,
      rawLength: error.raw?.length,
    }),
    ...(isConnectorError(error) && {
      connectorId: error.connectorId,
      phase: error.phase,
    }),
  };

  const level = getLogLevel(error);
  const prefix = `[${error.type.toUpperCase()}]`;

  switch (level) {
    case 'debug':
      if (config.consoleLogLevel === 'debug') {
        console.debug(prefix, error.message, logData);
      }
      break;
    case 'info':
      if (['debug', 'info'].includes(config.consoleLogLevel)) {
        console.info(prefix, error.message, logData);
      }
      break;
    case 'warn':
      if (['debug', 'info', 'warn'].includes(config.consoleLogLevel)) {
        console.warn(prefix, error.message, logData);
      }
      break;
    case 'error':
      console.error(prefix, error.message, logData);
      break;
  }
}

function getLogLevel(error: AppError): 'debug' | 'info' | 'warn' | 'error' {
  if (error.type === 'network') {
    // Les erreurs réseau retryable sont des warnings
    return error.retryable ? 'warn' : 'error';
  }
  if (error.type === 'storage') {
    return error.recoverable ? 'warn' : 'error';
  }
  if (error.type === 'parsing') {
    return 'error';
  }
  if (error.type === 'connector') {
    return error.recoverable ? 'warn' : 'error';
  }
  if (error.type === 'validation') {
    return 'warn';
  }
  return 'error';
}

// ============================================================================
// Monitoring
// ============================================================================

async function sendToMonitoring(error: AppError): Promise<void> {
  if (!config.monitoringUrl) {
    return;
  }

  try {
    const payload = {
      ...serializeError(error),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      extensionVersion:
        typeof chrome !== 'undefined' && chrome.runtime?.getManifest
          ? chrome.runtime.getManifest().version
          : 'unknown',
    };

    // Envoi en fire-and-forget (pas d'attente)
    fetch(config.monitoringUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Pas de credentials pour éviter les problèmes CORS
      credentials: 'omit',
    }).catch(() => {
      // Silencieux: on ne veut pas créer d'erreur infinie
    });
  } catch {
    // Silencieux: éviter les erreurs infinies
  }
}

// ============================================================================
// Toasts
// ============================================================================

export interface ToastMessage {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration: number;
}

// Store simple pour les toasts (pourrait être remplacé par un store Svelte)
const toastListeners: Set<(toast: ToastMessage) => void> = new Set();

/** S'abonne aux toasts (à appeler depuis un composant Svelte) */
export function subscribeToToasts(callback: (toast: ToastMessage) => void): () => void {
  toastListeners.add(callback);
  return () => toastListeners.delete(callback);
}

function showToast(error: AppError): void {
  const toast = createToastMessage(error);

  // Notifie tous les listeners
  toastListeners.forEach((listener) => {
    try {
      listener(toast);
    } catch {
      // Ignore les erreurs de listener
    }
  });

  // Fallback: si pas de listener, log dans la console
  if (toastListeners.size === 0 && import.meta.env.DEV) {
    console.warn(`[TOAST] ${toast.title}: ${toast.message}`);
  }
}

function createToastMessage(error: AppError): ToastMessage {
  const id = `${error.type}-${error.timestamp}-${Math.random().toString(36).slice(2, 9)}`;

  switch (error.type) {
    case 'network':
      return {
        id,
        type: error.retryable ? 'warning' : 'error',
        title: 'Erreur réseau',
        message: error.retryable
          ? 'Problème de connexion temporaire. Réessai en cours...'
          : 'Impossible de se connecter au serveur. Vérifiez votre connexion.',
        duration: error.retryable ? 3000 : 5000,
      };

    case 'storage':
      return {
        id,
        type: 'error',
        title: 'Erreur de stockage',
        message: "Impossible d'accéder aux données locales. Essayez de redémarrer l'extension.",
        duration: 5000,
      };

    case 'parsing':
      return {
        id,
        type: 'warning',
        title: 'Erreur de parsing',
        message: `Impossible d'analyser les données depuis ${error.source}. Le site a peut-être changé.`,
        duration: 5000,
      };

    case 'connector':
      return {
        id,
        type: error.recoverable ? 'warning' : 'error',
        title: `Erreur ${error.connectorId}`,
        message: getConnectorErrorMessage(error),
        duration: error.recoverable ? 3000 : 5000,
      };

    case 'validation':
      return {
        id,
        type: 'warning',
        title: 'Données invalides',
        message: error.field
          ? `Le champ "${error.field}" est invalide.`
          : 'Certaines données sont invalides.',
        duration: 3000,
      };

    default:
      return {
        id,
        type: 'error',
        title: 'Erreur',
        message: (error as AppError).message,
        duration: 5000,
      };
  }
}

function getConnectorErrorMessage(error: ConnectorError): string {
  switch (error.phase) {
    case 'detect':
      return `Impossible de détecter la session sur ${error.connectorId}. Vérifiez que vous êtes connecté.`;
    case 'fetch':
      return `Erreur lors de la récupération des missions depuis ${error.connectorId}.`;
    case 'parse':
      return `Le format des données de ${error.connectorId} a changé. Mise à jour nécessaire.`;
    default:
      return error.message;
  }
}

function shouldShowToast(error: AppError): boolean {
  // Ne pas montrer de toast pour les erreurs de validation silencieuses
  if (error.type === 'validation' && !error.context?.showToast) {
    return false;
  }
  // Toujours montrer les erreurs non recoverable
  if (!error.recoverable) {
    return true;
  }
  // Montrer les erreurs retryables uniquement si pas en retry automatique
  if (error.type === 'network') {
    return !error.retryable || error.context?.showRetryToast === true;
  }
  return true;
}

// ============================================================================
// Helpers
// ============================================================================

/** Détermine si une erreur doit être ignorée dans les logs (bruit) */
export function shouldIgnoreError(error: AppError): boolean {
  // Ignorer les erreurs d'abort (utilisateur a annulé)
  if (isNetworkError(error) && error.context?.aborted) {
    return true;
  }
  // Ignorer les erreurs 401/403 si on est en phase de détection
  if (isNetworkError(error) && error.status && [401, 403].includes(error.status)) {
    return true;
  }
  return false;
}

/** Wrapper pour capturer et gérer automatiquement les erreurs */
export function withErrorHandling<T>(
  fn: () => T,
  onError?: (error: AppError) => void
): T | undefined {
  try {
    return fn();
  } catch (e) {
    // Si c'est déjà une AppError, la gérer directement
    if (e && typeof e === 'object' && 'type' in e) {
      const error = e as AppError;
      if (!shouldIgnoreError(error)) {
        handleError(error);
      }
      onError?.(error);
      return undefined;
    }
    // Sinon, convertir en erreur générique
    const message = e instanceof Error ? e.message : String(e);
    console.error('[UNHANDLED]', message, e);
    return undefined;
  }
}

/** Wrapper async pour capturer et gérer automatiquement les erreurs */
export async function withErrorHandlingAsync<T>(
  fn: () => Promise<T>,
  onError?: (error: AppError) => void
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    // Si c'est déjà une AppError, la gérer directement
    if (e && typeof e === 'object' && 'type' in e) {
      const error = e as AppError;
      if (!shouldIgnoreError(error)) {
        handleError(error);
      }
      onError?.(error);
      return undefined;
    }
    // Sinon, convertir en erreur générique
    const message = e instanceof Error ? e.message : String(e);
    console.error('[UNHANDLED]', message, e);
    return undefined;
  }
}
