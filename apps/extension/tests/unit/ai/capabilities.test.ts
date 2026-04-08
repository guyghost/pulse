import { describe, it, expect, vi, afterEach } from 'vitest';

describe('isPromptApiAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns "no" when self.ai is undefined', async () => {
    vi.stubGlobal('self', {});
    const { isPromptApiAvailable } = await import('../../../src/lib/shell/ai/capabilities');
    expect(await isPromptApiAvailable()).toBe('no');
  });

  it('returns "available" when capabilities say available', async () => {
    vi.stubGlobal('self', {
      ai: {
        languageModel: {
          capabilities: vi.fn(async () => ({ available: 'readily' })),
        },
      },
    });
    const { isPromptApiAvailable } = await import('../../../src/lib/shell/ai/capabilities');
    expect(await isPromptApiAvailable()).toBe('available');
  });

  it('returns "after-download" when model needs download', async () => {
    vi.stubGlobal('self', {
      ai: {
        languageModel: {
          capabilities: vi.fn(async () => ({ available: 'after-download' })),
        },
      },
    });
    const { isPromptApiAvailable } = await import('../../../src/lib/shell/ai/capabilities');
    expect(await isPromptApiAvailable()).toBe('after-download');
  });

  it('returns "no" when capabilities throw', async () => {
    vi.stubGlobal('self', {
      ai: {
        languageModel: {
          capabilities: vi.fn(async () => {
            throw new Error('fail');
          }),
        },
      },
    });
    const { isPromptApiAvailable } = await import('../../../src/lib/shell/ai/capabilities');
    expect(await isPromptApiAvailable()).toBe('no');
  });
});
