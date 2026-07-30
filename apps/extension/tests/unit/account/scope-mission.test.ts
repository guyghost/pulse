import { describe, expect, it } from 'vitest';
import { scopeMissionToPlatformBinding } from '../../../src/lib/core/accounts/scope-mission';
import type { Mission } from '../../../src/lib/core/types/mission';

function mission(id: string): Mission {
  return {
    id,
    title: 'Mission',
    client: null,
    description: '',
    stack: [],
    tjm: null,
    location: null,
    remote: null,
    duration: null,
    startDate: null,
    publishedAt: null,
    url: 'https://example.test/mission',
    source: 'free-work',
    scrapedAt: new Date('2026-07-30T12:00:00.000Z'),
    seniority: null,
    scoreBreakdown: null,
    score: null,
    semanticScore: null,
    semanticReason: null,
  };
}

describe('mission platform binding scope', () => {
  it('keeps the external id and separates local ids for two bindings', () => {
    const first = scopeMissionToPlatformBinding(mission('external-1'), {
      accountId: 'account-1',
      bindingId: '11111111-1111-4111-8111-111111111111',
    });
    const second = scopeMissionToPlatformBinding(mission('external-1'), {
      accountId: 'account-1',
      bindingId: '22222222-2222-4222-8222-222222222222',
    });

    expect(first.externalId).toBe('external-1');
    expect(first.bindingId).toBe('11111111-1111-4111-8111-111111111111');
    expect(first.id).not.toBe(second.id);
  });

  it('is stable if an already scoped mission is scoped again', () => {
    const once = scopeMissionToPlatformBinding(mission('external-1'), {
      accountId: 'account-1',
      bindingId: '11111111-1111-4111-8111-111111111111',
    });
    const twice = scopeMissionToPlatformBinding(once, {
      accountId: 'account-1',
      bindingId: '11111111-1111-4111-8111-111111111111',
    });

    expect(twice.id).toBe(once.id);
    expect(twice.externalId).toBe('external-1');
  });
});
