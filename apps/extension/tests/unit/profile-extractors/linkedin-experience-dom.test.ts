import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  extractLinkedInExperiencesFromDom,
  type LinkedInExperienceDomOptions,
  type LinkedInExperienceDomSnapshot,
} from '../../../src/lib/shell/profile-extractors/linkedin-experience-dom';

const DETAIL_FIXTURE = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/linkedin-experience-detail.html'),
  'utf8'
);
const EMPTY_FIXTURE = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/linkedin-experience-empty.html'),
  'utf8'
);
const CHALLENGE_FIXTURE = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/linkedin-experience-challenge.html'),
  'utf8'
);
const LAZY_EMPTY_FIXTURE = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/linkedin-experience-lazy-empty.html'),
  'utf8'
);

const DEFAULT_OPTIONS: LinkedInExperienceDomOptions = {
  stabilizationTimeoutMs: 100,
  observationMs: 2,
  stableCycles: 2,
};

type Extractor = (options: LinkedInExperienceDomOptions) => Promise<LinkedInExperienceDomSnapshot>;

function render(html: string): void {
  document.body.innerHTML = html;
}

function serializedExtractor(): Extractor {
  return new Function(`return (${extractLinkedInExperiencesFromDom.toString()});`)() as Extractor;
}

async function extract(
  options: Partial<LinkedInExperienceDomOptions> = {}
): Promise<LinkedInExperienceDomSnapshot> {
  return serializedExtractor()({ ...DEFAULT_OPTIONS, ...options });
}

function standaloneRow(id: string, title: string): string {
  return `
    <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:${id}">
      <span aria-hidden="true"><strong>${title}</strong></span>
      <span aria-hidden="true">Example Corp · CDI</span>
      <span aria-hidden="true">janv. 2024 – aujourd’hui</span>
      <span aria-hidden="true">Paris, France · Hybride</span>
    </li>`;
}

describe('extractLinkedInExperiencesFromDom', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete document.documentElement.scrollHeight;
    delete document.documentElement.clientHeight;
    delete document.documentElement.scrollTop;
  });

  it('parses a standalone position and only leaf roles from a company group', async () => {
    render(DETAIL_FIXTURE);

    const snapshot = await extract();

    expect(snapshot).toMatchObject({ kind: 'ready' });
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences).toEqual([
      expect.objectContaining({
        title: 'Technical Lead',
        company: 'BNP Paribas Personal Finance',
        employmentType: 'Freelance',
        dateRange: 'janv. 2023 – oct. 2025',
        location: 'Levallois-Perret, Île-de-France, France · Hybride',
        skills: ['Java', 'Apache Kafka'],
      }),
      expect.objectContaining({ title: 'Staff Engineer', company: 'Acme', employmentType: 'CDI' }),
      expect.objectContaining({
        title: 'Software Engineer',
        company: 'Acme',
        employmentType: 'CDI',
      }),
    ]);
    expect(snapshot.experiences).toHaveLength(3);
  });

  it('recognizes the exact owner empty action inside the experience root', async () => {
    render(EMPTY_FIXTURE);

    await expect(extract()).resolves.toEqual({ kind: 'empty', experiences: [] });
  });

  it('classifies a security verification page as blocked', async () => {
    render(CHALLENGE_FIXTURE);

    await expect(extract()).resolves.toEqual({
      kind: 'blocked',
      experiences: [],
      blockedReason: 'security verification required',
    });
  });

  it('does not block challenge-like prose inside a valid experience row', async () => {
    render(
      DETAIL_FIXTURE.replace(
        'Pilotage de la plateforme de paiement.',
        'Analyse des unusual activity alerts et du security check sans verify your identity.'
      )
    );

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.description).toContain('unusual activity');
  });

  it('keeps challenge text authoritative when candidate markup is not parseable', async () => {
    render(`
      <main>
        <section id="experience">
          <h1>Security verification</h1>
          <p>Please verify your identity.</p>
          <ul class="pvs-list"><li class="pvs-list__paged-list-item">Incomplete row</li></ul>
        </section>
      </main>
    `);

    await expect(extract()).resolves.toEqual({
      kind: 'blocked',
      experiences: [],
      blockedReason: 'security verification required',
    });
  });

  it('returns timeout without partial rows when a recognized list keeps growing', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience"><ul class="pvs-list">${standaloneRow('initial', 'Initial')}</ul></section>
      </main>
    `);
    const list = document.querySelector('.pvs-list');
    if (!list) {
      throw new Error('expected list');
    }
    const interval = window.setInterval(() => {
      list.insertAdjacentHTML('beforeend', standaloneRow(String(list.children.length), 'Growing'));
    }, 1);

    const snapshot = await extract({
      stabilizationTimeoutMs: 20,
      observationMs: 2,
      stableCycles: 3,
    });
    window.clearInterval(interval);

    expect(snapshot).toEqual({ kind: 'timeout', experiences: [] });
  });

  it('returns unreadable for a generic page with no supported root or empty signal', async () => {
    render('<main><h1>Jane Doe</h1><p>Professional profile.</p></main>');

    await expect(extract({ stabilizationTimeoutMs: 15, observationMs: 2 })).resolves.toEqual({
      kind: 'unreadable',
      experiences: [],
    });
  });

  it('waits for a lazy appended row before declaring the list stable', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience"><ul class="pvs-list">${standaloneRow('one', 'First')}</ul></section>
      </main>
    `);
    const list = document.querySelector('.pvs-list');
    if (!list) {
      throw new Error('expected list');
    }
    window.setTimeout(() => {
      list.insertAdjacentHTML('beforeend', standaloneRow('two', 'Second'));
    }, 3);

    const snapshot = await extract({ observationMs: 5, stableCycles: 2 });

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences.map((experience) => experience.title)).toEqual(['First', 'Second']);
  });

  it('deduplicates distinct DOM rows by title, company, and start month', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            ${standaloneRow('first-source-row', 'Staff Engineer')}
            ${standaloneRow('duplicate-source-row', 'Staff Engineer')}
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences).toHaveLength(1);
    expect(snapshot.experiences[0]).toMatchObject({
      title: 'Staff Engineer',
      company: 'Example Corp',
      dateRange: 'janv. 2024 – aujourd’hui',
      externalId: 'urn:li:fsd_profilePosition:first-source-row',
    });
  });

  it('scrolls a recognized zero-row list so its first lazy row can load', async () => {
    render(LAZY_EMPTY_FIXTURE);
    const list = document.querySelector('.pvs-list');
    if (!list) {
      throw new Error('expected list');
    }
    let scrollTop = 0;
    let scrollCount = 0;
    Object.defineProperties(document.documentElement, {
      scrollHeight: { configurable: true, get: () => 100 },
      clientHeight: { configurable: true, get: () => 20 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
          scrollCount += 1;
          if (scrollCount === 1) {
            list.insertAdjacentHTML('beforeend', standaloneRow('lazy-first', 'Lazy First'));
          }
        },
      },
    });

    const snapshot = await extract();

    expect(scrollCount).toBeGreaterThan(0);
    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences.map((experience) => experience.title)).toEqual(['Lazy First']);
  });

  it('removes accessible duplicates and action text before assigning fields', async () => {
    render(DETAIL_FIXTURE);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.description).toBe('Pilotage de la plateforme de paiement.');
    expect(snapshot.experiences[0]?.description).not.toMatch(/Technical Lead|Voir plus/);
  });

  it('preserves visible line boundaries before normalization', async () => {
    render(DETAIL_FIXTURE);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.title).toBe('Technical Lead');
    expect(snapshot.experiences[0]?.title).not.toContain('BNP Paribas');
  });

  it('does not accept a generic zero-row experience page as empty', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience"><h1>Expérience</h1><p>Aucun contenu disponible.</p></section>
      </main>
    `);

    await expect(extract({ stabilizationTimeoutMs: 15, observationMs: 2 })).resolves.toEqual({
      kind: 'unreadable',
      experiences: [],
    });
  });
});
