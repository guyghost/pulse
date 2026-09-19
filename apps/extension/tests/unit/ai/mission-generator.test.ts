import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ availability: 'available' as 'available' | 'no' }));

vi.mock('$lib/shell/ai/capabilities', () => ({
  isPromptApiAvailable: vi.fn(async () => hoisted.availability),
  createPromptSession: vi.fn(),
}));

import { createPromptSession } from '$lib/shell/ai/capabilities';
import { generateAsset } from '$lib/shell/ai/mission-generator';
import type { Mission } from '$lib/core/types/mission';
import type { UserProfile } from '$lib/core/types/profile';

const profile: UserProfile = {
  firstName: 'Guy',
  keywords: ['TypeScript'],
  tjmMin: 500,
  tjmMax: 700,
  location: 'Paris',
  remote: 'hybrid',
  seniority: 'senior',
  jobTitle: 'Développeur Fullstack',
};

const makeMission = (): Mission => ({
  id: 'mission-1',
  title: 'Développeur Front-end React',
  client: 'ACME',
  description: 'Mission front-end React.',
  stack: ['React'],
  tjm: 600,
  location: 'Paris',
  remote: 'hybrid',
  duration: null,
  startDate: null,
  publishedAt: null,
  url: 'https://example.com/mission',
  source: 'free-work',
  scrapedAt: new Date('2026-09-18T12:00:00.000Z'),
  seniority: null,
  scoreBreakdown: null,
  score: null,
  semanticScore: null,
  semanticReason: null,
});

const sessionFactory = (responses: string[]) => {
  let callIndex = 0;
  const session = {
    prompt: vi.fn(async () => {
      const response = responses[Math.min(callIndex, responses.length - 1)];
      callIndex += 1;
      return response;
    }),
    destroy: vi.fn(),
  };
  vi.mocked(createPromptSession).mockResolvedValue(session as never);
  return { prompt: session.prompt, destroy: session.destroy };
};

// Valid content: cleanGenerationOutput strips quotes; isValidGeneration needs
// 20..5000 characters.
// NOTE: the first line must not start with 'Voici/Here is/Voilà' — the core
// meta-commentary filter strips such lines entirely (documented behaviour).
const validPitch =
  "Candidature motivée : six ans d'expérience React et TypeScript au service d'ACME.";

describe('mission generator — scenario replay', () => {
  beforeEach(() => {
    hoisted.availability = 'available';
    vi.mocked(createPromptSession).mockReset();
  });

  it('S1 — returns null without creating a session when Gemini Nano is unavailable', async () => {
    hoisted.availability = 'no';

    const asset = await generateAsset('mission-1', 'pitch', makeMission(), profile);

    expect(asset).toBeNull();
    expect(createPromptSession).not.toHaveBeenCalled();
  });

  it('S2 — generates a pitch asset with the gemini-nano model marker', async () => {
    const { prompt, destroy } = sessionFactory([validPitch]);

    const asset = await generateAsset('mission-1', 'pitch', makeMission(), profile);

    expect(asset).toMatchObject({
      missionId: 'mission-1',
      type: 'pitch',
      content: validPitch,
      modelUsed: 'gemini-nano',
    });
    expect(asset?.id).toContain('gen-pitch-mission-1');
    expect(prompt).toHaveBeenCalledTimes(1);
    // The session is always destroyed, even on success.
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('S3 — routes each generation type to its dedicated prompt builder', async () => {
    const seenPrompts: string[] = [];
    const { prompt } = sessionFactory([validPitch, validPitch, validPitch]);
    vi.mocked(prompt).mockImplementation(async (built: string) => {
      seenPrompts.push(built);
      return validPitch;
    });

    await generateAsset('mission-1', 'pitch', makeMission(), profile);
    await generateAsset('mission-1', 'cover-message', makeMission(), profile);
    await generateAsset('mission-1', 'cv-summary', makeMission(), profile);

    // The prompts differ per type (title/case usage proves distinct builders).
    expect(new Set(seenPrompts).size).toBe(3);
  });

  it('S4 — returns null when every attempt fails (timeout or provider error)', async () => {
    const { prompt, destroy } = sessionFactory(['   ']);
    vi.mocked(prompt).mockRejectedValue(new Error('timeout'));

    const asset = await generateAsset('mission-1', 'pitch', makeMission(), profile);

    expect(asset).toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('S5 — returns null when the model output is not a valid generation', async () => {
    sessionFactory(['court']);
    const asset = await generateAsset('mission-1', 'pitch', makeMission(), profile);

    expect(asset).toBeNull();
  });

  it('S6 — trims fences and quotes from the model output', async () => {
    sessionFactory(['```text\n' + validPitch + '\n```']);

    const asset = await generateAsset('mission-1', 'cover-message', makeMission(), profile);

    expect(asset?.content).toBe(validPitch);
  });
});

describe('mission generator — meta-commentary regression (DAO #208)', () => {
  it('S7 — generates an asset even when the single-line output starts with "Voici"', async () => {
    sessionFactory(['Voici un pitch convaincant de plus de vingt caractères pour ACME.']);

    const asset = await generateAsset('mission-1', 'pitch', makeMission(), profile);

    expect(asset).not.toBeNull();
    expect(asset?.content).toBe(
      'Voici un pitch convaincant de plus de vingt caractères pour ACME.'
    );
  });

  it('S8 — keeps the content written after a meta-intro colon', async () => {
    sessionFactory(["Voici ma candidature : six ans d'expérience React et TypeScript."]);

    const asset = await generateAsset('mission-1', 'cover-message', makeMission(), profile);

    expect(asset?.content).toBe("six ans d'expérience React et TypeScript.");
  });
});
