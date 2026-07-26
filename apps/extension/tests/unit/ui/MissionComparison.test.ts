import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import MissionComparison from '../../../src/ui/organisms/MissionComparison.svelte';
import type { Mission } from '$lib/core/types/mission';
import type { Grade, ScoreBreakdown } from '$lib/core/types/score';

function gradeFor(total: number): Grade {
  if (total >= 80) {
    return 'A';
  }
  if (total >= 60) {
    return 'B';
  }
  if (total >= 40) {
    return 'C';
  }
  if (total >= 20) {
    return 'D';
  }
  return 'F';
}

function makeBreakdown(total: number): ScoreBreakdown {
  return {
    criteria: {
      stack: 80,
      location: 70,
      tjm: 70,
      remote: 70,
      seniorityBonus: 0,
      startDateBonus: 0,
    },
    deterministic: total,
    semantic: null,
    semanticReason: null,
    total,
    grade: gradeFor(total),
  };
}

function makeMission(overrides: Partial<Mission>): Mission {
  return {
    id: 'm',
    title: 'Mission',
    client: 'Client',
    description: 'description',
    stack: ['TypeScript'],
    tjm: 600,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    startDate: null,
    publishedAt: null,
    url: 'https://example.com/m',
    source: 'free-work',
    scrapedAt: new Date('2026-05-27T12:00:00.000Z'),
    seniority: 'senior',
    scoreBreakdown: null,
    score: 0,
    semanticScore: null,
    semanticReason: null,
    ...overrides,
  };
}

function mountComparison(missions: Mission[]): HTMLDivElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(MissionComparison, { target, props: { missions, onClose: () => {} } });
  return target;
}

describe('MissionComparison score', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the same fused score in the table and the recommendation', async () => {
    // Both missions carry a semanticScore that diverges from breakdown.total.
    // Recommended mission A: fused total = 85, legacy semantic = 78.
    const missions = [
      makeMission({
        id: 'a',
        title: 'Mission A',
        scoreBreakdown: makeBreakdown(85),
        semanticScore: 78,
        score: 85,
      }),
      makeMission({
        id: 'b',
        title: 'Mission B',
        scoreBreakdown: makeBreakdown(70),
        semanticScore: 12,
        score: 70,
      }),
    ];

    mountComparison(missions);
    await tick();

    // The canonical fused score (85) must render in BOTH the recommendation
    // evidence and the comparison table cell for the recommended mission.
    const occurrences = document.body.textContent?.match(/85\/100/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);

    // The divergent legacy semantic score must never be shown as a score cell.
    expect(document.body.textContent).not.toContain('78/100');
  });

  it('ranks the recommendation by the fused total', async () => {
    const missions = [
      makeMission({
        id: 'low-semantic',
        title: 'Semantic trap',
        scoreBreakdown: makeBreakdown(88),
        semanticScore: 99,
        score: 88,
      }),
      makeMission({
        id: 'high-total',
        title: 'True best',
        scoreBreakdown: makeBreakdown(91),
        semanticScore: 10,
        score: 91,
      }),
    ];

    mountComparison(missions);
    await tick();

    // high-total (91) outranks low-semantic (88) despite the 99 semantic bait.
    expect(document.body.textContent).toContain('Priorité: True best');
  });
});

describe('MissionComparison modal focus', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses close, traps Tab, closes with Escape and restores the trigger', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Comparer';
    document.body.appendChild(trigger);
    trigger.focus();

    const target = document.createElement('div');
    document.body.appendChild(target);
    const missions = [
      makeMission({ id: 'a', title: 'Mission A', url: 'https://example.com/a' }),
      makeMission({ id: 'b', title: 'Mission B', url: 'https://example.com/b' }),
    ];
    let component: ReturnType<typeof mount> | null = null;
    const onClose = vi.fn(() => {
      if (component) {
        void unmount(component);
      }
    });
    component = mount(MissionComparison, { target, props: { missions, onClose } });
    await tick();
    await Promise.resolve();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const close = document.querySelector<HTMLButtonElement>('[aria-label="Fermer"]');
    expect(document.activeElement).toBe(close);
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    close!.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    );
    expect(document.activeElement).toBe(
      document.querySelector<HTMLAnchorElement>('[data-modal-mission-link]')
    );

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    await tick();
    await Promise.resolve();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it('does not restore an external trigger for an owner unmount', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Comparer';
    document.body.appendChild(trigger);
    trigger.focus();

    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(MissionComparison, {
      target,
      props: {
        missions: [makeMission({ id: 'a' }), makeMission({ id: 'b' })],
        onClose: () => {},
      },
    });
    await tick();
    await Promise.resolve();
    await unmount(component);

    expect(document.activeElement).not.toBe(trigger);
  });
});
