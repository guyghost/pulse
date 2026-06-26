import { describe, it, expect, vi, afterEach } from 'vitest';

describe('isPromptApiAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns "no" when self.ai is undefined', async () => {
    vi.stubGlobal('LanguageModel', undefined);
    vi.stubGlobal('ai', undefined);
    const { isPromptApiAvailable } = await import('../../../src/lib/shell/ai/capabilities');
    expect(await isPromptApiAvailable()).toBe('no');
  });

  it('uses the current LanguageModel availability API first', async () => {
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn(async () => 'available'),
      create: vi.fn(),
    });
    const { isPromptApiAvailable } = await import('../../../src/lib/shell/ai/capabilities');
    expect(await isPromptApiAvailable()).toBe('available');
  });

  it('maps current download states to "after-download"', async () => {
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn(async () => 'downloadable'),
      create: vi.fn(),
    });
    const { isPromptApiAvailable } = await import('../../../src/lib/shell/ai/capabilities');
    expect(await isPromptApiAvailable()).toBe('after-download');
  });

  it('falls back to the legacy self.ai language model API', async () => {
    vi.stubGlobal('LanguageModel', undefined);
    vi.stubGlobal('ai', {
      languageModel: {
        capabilities: vi.fn(async () => ({ available: 'readily' })),
        create: vi.fn(),
      },
    });
    const { isPromptApiAvailable } = await import('../../../src/lib/shell/ai/capabilities');
    expect(await isPromptApiAvailable()).toBe('available');
  });

  it('returns "after-download" when the legacy model needs download', async () => {
    vi.stubGlobal('LanguageModel', undefined);
    vi.stubGlobal('ai', {
      languageModel: {
        capabilities: vi.fn(async () => ({ available: 'after-download' })),
        create: vi.fn(),
      },
    });
    const { isPromptApiAvailable } = await import('../../../src/lib/shell/ai/capabilities');
    expect(await isPromptApiAvailable()).toBe('after-download');
  });

  it('returns "no" when availability checks throw', async () => {
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn(async () => {
        throw new Error('fail');
      }),
      create: vi.fn(),
    });
    const { isPromptApiAvailable } = await import('../../../src/lib/shell/ai/capabilities');
    expect(await isPromptApiAvailable()).toBe('no');
  });

  it('creates sessions through the current Prompt API', async () => {
    const session = { prompt: vi.fn(), promptStreaming: vi.fn(), destroy: vi.fn() };
    const create = vi.fn(async () => session);
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn(async () => 'available'),
      create,
    });

    const { createPromptSession } = await import('../../../src/lib/shell/ai/capabilities');
    await expect(createPromptSession()).resolves.toBe(session);
    expect(create).toHaveBeenCalledOnce();
  });

  it('creates sessions through the legacy fallback when needed', async () => {
    const session = { prompt: vi.fn(), promptStreaming: vi.fn(), destroy: vi.fn() };
    const create = vi.fn(async () => session);
    vi.stubGlobal('LanguageModel', undefined);
    vi.stubGlobal('ai', {
      languageModel: {
        capabilities: vi.fn(async () => ({ available: 'readily' })),
        create,
      },
    });

    const { createPromptSession } = await import('../../../src/lib/shell/ai/capabilities');
    await expect(createPromptSession()).resolves.toBe(session);
    expect(create).toHaveBeenCalledOnce();
  });

  it('throws when creating a session without any Prompt API runtime', async () => {
    vi.stubGlobal('LanguageModel', undefined);
    vi.stubGlobal('ai', undefined);

    const { createPromptSession } = await import('../../../src/lib/shell/ai/capabilities');
    await expect(createPromptSession()).rejects.toThrow('Prompt API unavailable');
  });
});
