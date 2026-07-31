export const TASK5_APPLICATION_TRACKING_ERROR_CODES = [
  'LOAD_FAILED',
  'PERSIST_FAILED',
  'INVALID_TRANSITION',
  'INVALID_DETAILS',
  'INVALID_RESTORE',
  'TRANSPORT_ERROR',
  'PROTOCOL_ERROR',
] as const;

export type Task5ApplicationTrackingErrorCode =
  (typeof TASK5_APPLICATION_TRACKING_ERROR_CODES)[number];

export type ApplicationTrackingIntent = 'load' | 'transition' | 'details' | 'restore';

export interface SerializedApplicationTrackingError {
  readonly version: 1;
  readonly code: Task5ApplicationTrackingErrorCode;
  readonly intent: ApplicationTrackingIntent;
  readonly missionId: string | null;
  readonly mutationId: null;
  readonly message: string;
  readonly recoverable: boolean;
}

interface TrackingErrorDescriptor {
  readonly message: string;
  readonly recoverable: boolean;
}

const TRANSPORT_ERROR_MESSAGE =
  'La confirmation du suivi n’a pas été reçue. Rechargez le suivi avant de réessayer.';
const PROTOCOL_ERROR_MESSAGE =
  'La réponse du suivi est invalide. Rechargez le suivi avant de réessayer.';

export function getApplicationTrackingErrorDescriptor(
  intent: ApplicationTrackingIntent,
  code: Task5ApplicationTrackingErrorCode
): TrackingErrorDescriptor | null {
  switch (code) {
    case 'LOAD_FAILED':
      return intent === 'load'
        ? { message: 'Impossible de charger le suivi des candidatures.', recoverable: true }
        : null;
    case 'PERSIST_FAILED':
      switch (intent) {
        case 'transition':
          return { message: 'Impossible d’enregistrer le nouveau statut.', recoverable: true };
        case 'details':
          return {
            message: 'Impossible d’enregistrer les détails de suivi.',
            recoverable: true,
          };
        case 'restore':
          return { message: 'Impossible d’annuler la modification.', recoverable: true };
        case 'load':
          return null;
      }
      return null;
    case 'INVALID_TRANSITION':
      return intent === 'transition'
        ? { message: 'Ce changement de statut n’est pas autorisé.', recoverable: false }
        : null;
    case 'INVALID_DETAILS':
      return intent === 'details'
        ? { message: 'Les détails de suivi sont invalides.', recoverable: false }
        : null;
    case 'INVALID_RESTORE':
      return intent === 'restore'
        ? { message: 'Cette annulation n’est pas valide.', recoverable: false }
        : null;
    case 'TRANSPORT_ERROR':
      return { message: TRANSPORT_ERROR_MESSAGE, recoverable: true };
    case 'PROTOCOL_ERROR':
      return { message: PROTOCOL_ERROR_MESSAGE, recoverable: true };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTrackingIntent(value: unknown): value is ApplicationTrackingIntent {
  return value === 'load' || value === 'transition' || value === 'details' || value === 'restore';
}

function isTask5Code(value: unknown): value is Task5ApplicationTrackingErrorCode {
  return (
    typeof value === 'string' &&
    TASK5_APPLICATION_TRACKING_ERROR_CODES.some((code) => code === value)
  );
}

function hasExpectedMissionIdentity(
  intent: ApplicationTrackingIntent,
  missionId: unknown
): missionId is string | null {
  if (intent === 'load') {
    return missionId === null;
  }
  return typeof missionId === 'string' && missionId.length > 0 && missionId.length <= 256;
}

export function isSerializedApplicationTrackingError(
  value: unknown
): value is SerializedApplicationTrackingError {
  if (!isRecord(value) || Object.keys(value).length !== 7) {
    return false;
  }
  if (
    value.version !== 1 ||
    !isTask5Code(value.code) ||
    !isTrackingIntent(value.intent) ||
    !hasExpectedMissionIdentity(value.intent, value.missionId) ||
    value.mutationId !== null ||
    typeof value.message !== 'string' ||
    typeof value.recoverable !== 'boolean'
  ) {
    return false;
  }

  const descriptor = getApplicationTrackingErrorDescriptor(value.intent, value.code);
  return (
    descriptor !== null &&
    descriptor.message === value.message &&
    descriptor.recoverable === value.recoverable
  );
}

export function createSerializedApplicationTrackingError(
  intent: ApplicationTrackingIntent,
  missionId: string | null,
  code: Task5ApplicationTrackingErrorCode
): SerializedApplicationTrackingError {
  const descriptor = getApplicationTrackingErrorDescriptor(intent, code);
  if (!descriptor || !hasExpectedMissionIdentity(intent, missionId)) {
    throw new Error(`Invalid application tracking error mapping: ${intent}/${code}`);
  }
  return {
    version: 1,
    code,
    intent,
    missionId,
    mutationId: null,
    message: descriptor.message,
    recoverable: descriptor.recoverable,
  };
}

export class ApplicationTrackingError extends Error {
  readonly name = 'ApplicationTrackingError';
  readonly code: Task5ApplicationTrackingErrorCode;
  readonly intent: ApplicationTrackingIntent;
  readonly missionId: string | null;
  readonly mutationId: null;
  readonly recoverable: boolean;

  constructor(payload: SerializedApplicationTrackingError) {
    super(payload.message);
    this.code = payload.code;
    this.intent = payload.intent;
    this.missionId = payload.missionId;
    this.mutationId = payload.mutationId;
    this.recoverable = payload.recoverable;
  }
}

export function createApplicationTrackingError(
  intent: ApplicationTrackingIntent,
  missionId: string | null,
  code: Task5ApplicationTrackingErrorCode
): ApplicationTrackingError {
  return new ApplicationTrackingError(
    createSerializedApplicationTrackingError(intent, missionId, code)
  );
}
