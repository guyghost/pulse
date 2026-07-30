import { describe, expect, it } from 'vitest';
import { isSupportedApplicationOrigin } from '../../../src/lib/shell/ai/form-assist';

describe('application form assistance origin policy', () => {
  it.each([
    'https://www.free-work.com/fr/tech-it/apply',
    'https://app.lehibou.com/missions/42',
    'https://hiway-missions.fr/application',
    'https://client.collective.work/opportunity',
    'https://app.cherry-pick.io/jobs/1',
    'https://www.malt.fr/project/1',
  ])('allows only an already-supported connector origin: %s', (url) => {
    expect(isSupportedApplicationOrigin(url)).toBe(true);
  });

  it.each([
    'http://www.free-work.com/fr/tech-it/apply',
    'https://example.com/apply',
    'https://fakefree-work.com/apply',
    'not-a-url',
  ])('rejects unsupported or insecure origins: %s', (url) => {
    expect(isSupportedApplicationOrigin(url)).toBe(false);
  });
});
