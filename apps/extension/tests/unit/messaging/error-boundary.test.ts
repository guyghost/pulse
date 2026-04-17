import { describe, it, expect, vi } from 'vitest';
import { classifyError } from '../../../src/lib/shell/messaging/error-boundary';

// ============================================================================
// classifyError
// ============================================================================

describe('classifyError', () => {
  it('retourne UNKNOWN pour une valeur non-Error', () => {
    expect(classifyError('string error')).toBe('UNKNOWN');
    expect(classifyError(42)).toBe('UNKNOWN');
    expect(classifyError(null)).toBe('UNKNOWN');
  });

  it('retourne CONNECTOR_ERROR pour une erreur liée au connecteur', () => {
    expect(classifyError(new Error('ConnectorError: DOM changed'))).toBe('CONNECTOR_ERROR');
    expect(classifyError(new Error('scrape failed: timeout'))).toBe('CONNECTOR_ERROR');
  });

  it('retourne STORAGE_ERROR pour une erreur IndexedDB / quota', () => {
    expect(classifyError(new Error('QUOTA_BYTES exceeded in storage'))).toBe('STORAGE_ERROR');
    expect(classifyError(new Error('indexeddb transaction failed'))).toBe('STORAGE_ERROR');
  });

  it('retourne PAYLOAD_TOO_LARGE pour un payload trop grand', () => {
    expect(classifyError(new Error('payload too large for this request'))).toBe(
      'PAYLOAD_TOO_LARGE'
    );
  });

  it('retourne UNKNOWN pour une erreur générique', () => {
    expect(classifyError(new Error('something unexpected'))).toBe('UNKNOWN');
  });
});

// ============================================================================
// withErrorBoundary — validation
// ============================================================================

// Mock import.meta.env.DEV pour éviter les console.warn dans les tests
vi.stubGlobal('import', { meta: { env: { DEV: false } } });

import { withErrorBoundary } from '../../../src/lib/shell/messaging/error-boundary';

const noopSender = {} as chrome.runtime.MessageSender;

describe('withErrorBoundary — validation', () => {
  it('rejette un message invalide sans appeler le handler', () => {
    const handler = vi.fn();
    const wrapped = withErrorBoundary(handler, 'TEST');

    const sendResponse = vi.fn();
    wrapped(null, noopSender, sendResponse);

    expect(handler).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('rejette un message sans type string', () => {
    const handler = vi.fn();
    const wrapped = withErrorBoundary(handler, 'TEST');
    const sendResponse = vi.fn();

    wrapped({ type: 123 }, noopSender, sendResponse);

    expect(handler).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      })
    );
  });

  it('appelle le handler avec un message valide (type connu)', () => {
    const handler = vi.fn(() => false);
    const wrapped = withErrorBoundary(handler, 'SCAN_CANCEL');

    const sendResponse = vi.fn();
    wrapped({ type: 'SCAN_CANCEL' }, noopSender, sendResponse);

    expect(handler).toHaveBeenCalledOnce();
  });

  it('appelle le handler avec un type inconnu (backward compat)', () => {
    const handler = vi.fn(() => false);
    const wrapped = withErrorBoundary(handler, 'FUTURE_MSG');

    const sendResponse = vi.fn();
    wrapped({ type: 'FUTURE_MSG', payload: {} }, noopSender, sendResponse);

    expect(handler).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// withErrorBoundary — error boundary (sync)
// ============================================================================

describe('withErrorBoundary — error boundary sync', () => {
  it("attrape une erreur sync et envoie une réponse d'erreur", () => {
    const handler = vi.fn(() => {
      throw new Error('something went wrong');
    });
    const wrapped = withErrorBoundary(handler, 'SCAN_START');
    const sendResponse = vi.fn();

    // Ne devrait pas lever d'exception
    expect(() => wrapped({ type: 'SCAN_START' }, noopSender, sendResponse)).not.toThrow();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNKNOWN' }),
      })
    );
  });

  it('classifie correctement les erreurs storage', () => {
    const handler = vi.fn(() => {
      throw new Error('indexeddb transaction aborted');
    });
    const wrapped = withErrorBoundary(handler, 'GET_PROFILE');
    const sendResponse = vi.fn();

    wrapped({ type: 'GET_PROFILE' }, noopSender, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'STORAGE_ERROR' }) })
    );
  });
});

// ============================================================================
// withErrorBoundary — error boundary (async)
// ============================================================================

describe('withErrorBoundary — error boundary async', () => {
  it('retourne true pour un handler async', () => {
    const handler = vi.fn((_msg, _sender, sendResponse: (r: unknown) => void) => {
      Promise.resolve().then(() => sendResponse({ type: 'PROFILE_RESULT', payload: null }));
      return true as const;
    });
    const wrapped = withErrorBoundary(handler, 'GET_PROFILE');
    const sendResponse = vi.fn();

    const result = wrapped({ type: 'GET_PROFILE' }, noopSender, sendResponse);
    expect(result).toBe(true);
  });

  it('attrape une erreur async et appelle sendResponse', async () => {
    const handler = vi.fn((_msg, _sender, sendResponse: (r: unknown) => void) => {
      const p = Promise.reject(new Error('async storage failure'));
      p.catch(() => {}); // suppress unhandled rejection in test
      return p as unknown as true;
    });
    const wrapped = withErrorBoundary(handler, 'GET_PROFILE');
    const sendResponse = vi.fn();

    wrapped({ type: 'GET_PROFILE' }, noopSender, sendResponse);

    // Laisser les microtâches se terminer
    await new Promise((r) => setTimeout(r, 10));

    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
