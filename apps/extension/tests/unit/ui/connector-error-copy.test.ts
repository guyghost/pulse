import { describe, expect, it } from 'vitest';
import { getConnectorErrorCopy } from '../../../src/ui/copy/connector-error-copy';

describe('connector error copy', () => {
  it('hides Collective GraphQL details behind an actionable user label', () => {
    const copy = getConnectorErrorCopy({
      connectorId: 'collective',
      connectorName: 'Collective',
      message: 'Collective GraphQL error: [{"message":"Not authorized"}]',
      phase: 'fetch',
    });

    expect(copy.label).toBe('Accès à vérifier');
    expect(copy.label).not.toContain('GraphQL');
    expect(copy.reconnectRecommended).toBe(true);
  });

  it('keeps session errors focused on reconnection', () => {
    const copy = getConnectorErrorCopy({
      connectorId: 'free-work',
      connectorName: 'Free-Work',
      message: 'Session expirée',
    });

    expect(copy).toEqual({
      label: 'Connexion à vérifier',
      reconnectRecommended: true,
    });
  });

  it('labels parser failures without leaking implementation language', () => {
    const copy = getConnectorErrorCopy({
      connectorId: 'hiway',
      connectorName: 'Hiway',
      error: {
        type: 'connector',
        phase: 'parse',
        message: 'DOM selector missing',
      },
    });

    expect(copy).toEqual({
      label: 'Source modifiée',
      reconnectRecommended: false,
    });
  });
});
