export interface ConnectorErrorCopyInput {
  readonly connectorId?: string;
  readonly connectorName?: string;
  readonly error?: unknown;
  readonly message?: string;
  readonly phase?: string;
}

export interface ConnectorErrorCopy {
  readonly label: string;
  readonly reconnectRecommended: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(error: unknown, field: string): string | undefined {
  const record = asRecord(error);
  const value = record?.[field];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function normalize(value: string | undefined): string {
  return value?.toLowerCase() ?? '';
}

function includesAny(value: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

export function getConnectorErrorCopy(input: ConnectorErrorCopyInput): ConnectorErrorCopy {
  const connectorId = normalize(input.connectorId ?? readString(input.error, 'connectorId'));
  const message = normalize(input.message ?? readString(input.error, 'message'));
  const phase = normalize(input.phase ?? readString(input.error, 'phase'));

  if (connectorId === 'collective' && message.includes('graphql')) {
    return {
      label: 'Accès à vérifier',
      reconnectRecommended: true,
    };
  }

  if (
    includesAny(message, [
      'auth',
      'connectez',
      'cookie',
      'expir',
      'forbidden',
      'login',
      'session',
      'unauthorized',
    ])
  ) {
    return {
      label: 'Connexion à vérifier',
      reconnectRecommended: true,
    };
  }

  if (includesAny(message, ['bloqu', 'blocked', 'cloudflare', '403'])) {
    return {
      label: 'Accès à valider',
      reconnectRecommended: true,
    };
  }

  if (phase === 'parse' || includesAny(message, ['dom', 'format', 'parser', 'schema'])) {
    return {
      label: 'Source modifiée',
      reconnectRecommended: false,
    };
  }

  if (includesAny(message, ['fetch', 'http', 'network', 'timeout'])) {
    return {
      label: 'Source indisponible',
      reconnectRecommended: false,
    };
  }

  return {
    label: 'Source à vérifier',
    reconnectRecommended: false,
  };
}
