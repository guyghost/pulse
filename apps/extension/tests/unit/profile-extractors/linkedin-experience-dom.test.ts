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
const SEMANTIC_DETAIL_FIXTURE = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/linkedin-experience-semantic-detail.html'),
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
  stabilizationTimeoutMs: 500,
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

  it('parses current semantic LinkedIn position entities without historical CSS classes', async () => {
    render(SEMANTIC_DETAIL_FIXTURE);

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences).toHaveLength(2);
    expect(snapshot.experiences.map((experience) => experience.title)).toEqual([
      'Technical Lead',
      'Solution Architect',
    ]);
  });

  it('parses the LinkedIn owner view from stable edit-form links', async () => {
    render(`
      <main>
        <section>
          <h1>Expérience</h1>
          <div class="generated-owner-position">
            <a href="/in/guyghost/details/experience/edit/forms/2397304299/">
              <span aria-hidden="true"><strong>Technical Lead</strong></span>
              <span aria-hidden="true">BNP Paribas Personal Finance · Freelance</span>
              <span aria-hidden="true">janv. 2023 - oct. 2025 · 2 ans 10 mois</span>
              <span aria-hidden="true">Levallois-Perret, Île-de-France, France · Hybride</span>
            </a>
            <a href="/in/guyghost/details/experience/edit/forms/2397304299/">
              Modifier Technical Lead chez BNP Paribas Personal Finance
            </a>
          </div>
        </section>
      </main>
    `);

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences).toEqual([
      expect.objectContaining({
        title: 'Technical Lead',
        company: 'BNP Paribas Personal Finance',
        employmentType: 'Freelance',
        dateRange: 'janv. 2023 - oct. 2025',
        externalId: 'linkedin-owner-position-2397304299',
      }),
    ]);
  });

  it('includes an owner-view description rendered beside the edit-form link', async () => {
    render(`
      <main>
        <section>
          <h1>Expérience</h1>
          <div class="generated-owner-position">
            <a href="/in/guyghost/details/experience/edit/forms/2397304299/">
              <span aria-hidden="true"><strong>Technical Lead</strong></span>
              <span aria-hidden="true">BNP Paribas Personal Finance · Freelance</span>
              <span aria-hidden="true">janv. 2023 - oct. 2025 · 2 ans 10 mois</span>
              <span aria-hidden="true">Levallois-Perret, Île-de-France, France · Hybride</span>
            </a>
            <div class="generated-owner-position-details">
              <span aria-hidden="true">Pilotage de la plateforme de paiement.</span>
            </div>
            <a href="/in/guyghost/details/experience/edit/forms/2397304299/">
              Modifier Technical Lead chez BNP Paribas Personal Finance
            </a>
          </div>
          <div class="generated-owner-position">
            <a href="/in/guyghost/details/experience/edit/forms/9876543210/">
              <span aria-hidden="true"><strong>Solution Architect</strong></span>
              <span aria-hidden="true">ING · CDI</span>
              <span aria-hidden="true">mars 2020 - déc. 2022 · 2 ans 10 mois</span>
              <span aria-hidden="true">Paris, France</span>
            </a>
            <div class="generated-owner-position-details">
              <span aria-hidden="true">Architecture des services critiques.</span>
            </div>
          </div>
        </section>
      </main>
    `);

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences).toEqual([
      expect.objectContaining({
        title: 'Technical Lead',
        company: 'BNP Paribas Personal Finance',
        description: 'Pilotage de la plateforme de paiement.',
        externalId: 'linkedin-owner-position-2397304299',
      }),
      expect.objectContaining({
        title: 'Solution Architect',
        company: 'ING',
        description: 'Architecture des services critiques.',
        externalId: 'linkedin-owner-position-9876543210',
      }),
    ]);
  });

  it('parses a structurally valid generic list row with generated CSS classes', async () => {
    render(`
      <main>
        <section id="experience">
          <ul>
            <li class="generated-position-class">
              <span aria-hidden="true"><strong>Platform Architect</strong></span>
              <span aria-hidden="true">Fortuneo · Freelance</span>
              <span aria-hidden="true">févr. 2018 – févr. 2020 · 2 ans</span>
              <span aria-hidden="true">Paris, France</span>
            </li>
            <li class="generated-page-chrome">
              <span aria-hidden="true">Personnes que vous pourriez connaître</span>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences).toEqual([
      expect.objectContaining({
        title: 'Platform Architect',
        company: 'Fortuneo',
        employmentType: 'Freelance',
      }),
    ]);
  });

  it('preserves inherited company context for semantic grouped positions', async () => {
    render(`
      <main>
        <section id="experience">
          <div role="list">
            <div role="listitem" data-view-name="profile-component-entity">
              <span aria-hidden="true"><strong>Acme</strong></span>
              <span aria-hidden="true">5 ans</span>
              <div role="list">
                <div role="listitem" data-view-name="profile-component-entity">
                  <a href="/in/example/details/experience/?profilePosition=principal">
                    <span aria-hidden="true"><strong>Principal Engineer</strong></span>
                  </a>
                  <span aria-hidden="true">janv. 2024 – aujourd’hui · 2 ans</span>
                  <span aria-hidden="true">Paris, France</span>
                </div>
                <div role="listitem" data-view-name="profile-component-entity">
                  <a href="/in/example/details/experience/?profilePosition=staff">
                    <span aria-hidden="true"><strong>Staff Engineer</strong></span>
                  </a>
                  <span aria-hidden="true">CDI</span>
                  <span aria-hidden="true">janv. 2022 – déc. 2023 · 2 ans</span>
                  <span aria-hidden="true">Lyon, France</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    `);

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences).toEqual([
      expect.objectContaining({ title: 'Principal Engineer', company: 'Acme' }),
      expect.objectContaining({ title: 'Staff Engineer', company: 'Acme', employmentType: 'CDI' }),
    ]);
  });

  it('rejects a strongly identified malformed position instead of merging a partial list', async () => {
    render(`
      <main>
        <section id="experience">
          <ul>${standaloneRow('valid-position', 'Valid Engineer')}</ul>
          <div role="listitem" data-view-name="profile-component-entity">
            <a href="/in/example/details/experience/?profilePosition=malformed-position">
              <span aria-hidden="true"><strong>Malformed Engineer</strong></span>
            </a>
            <span aria-hidden="true">Example Corp · CDI</span>
          </div>
        </section>
      </main>
    `);

    await expect(extract()).resolves.toEqual({ kind: 'unreadable', experiences: [] });
  });

  it('ignores an unparseable weak candidate beside a valid position', async () => {
    render(`
      <main>
        <section id="experience">
          <ul>
            ${standaloneRow('valid-position', 'Valid Engineer')}
            <li class="generated-page-chrome">
              <span aria-hidden="true"><strong>Release history</strong></span>
              <span aria-hidden="true">2020 – 2022</span>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences.map((experience) => experience.title)).toEqual(['Valid Engineer']);
  });

  it('keeps a dated description bullet inside its strongly identified position', async () => {
    render(`
      <main>
        <section id="experience">
          <ul>
            <li data-entity-urn="urn:li:fsd_profilePosition:strong-parent">
              <span aria-hidden="true"><strong>Technical Lead</strong></span>
              <span aria-hidden="true">Acme · Freelance</span>
              <span aria-hidden="true">janv. 2021 – déc. 2024 · 4 ans</span>
              <span aria-hidden="true">Paris, France</span>
              <ul>
                <li>
                  <span aria-hidden="true"><strong>Migration phase</strong></span>
                  <span aria-hidden="true">2020 – 2022</span>
                </li>
              </ul>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences).toEqual([
      expect.objectContaining({ title: 'Technical Lead', company: 'Acme' }),
    ]);
  });

  it('does not promote a hyphenated certification line to a date range', async () => {
    render(`
      <main>
        <section id="experience">
          <ul>
            ${standaloneRow('valid-position', 'Valid Engineer')}
            <li class="generated-page-chrome">
              <span aria-hidden="true"><strong>Security program</strong></span>
              <span aria-hidden="true">Example Corp · CDI</span>
              <span aria-hidden="true">ISO-27001 recertified in 2023</span>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences.map((experience) => experience.title)).toEqual(['Valid Engineer']);
  });

  it('uses a valid representation when the same strong identity also has an incomplete duplicate', async () => {
    render(`
      <main>
        <section id="experience">
          <ul>${standaloneRow('duplicate-position', 'Canonical Engineer')}</ul>
          <div role="listitem" data-view-name="profile-component-entity">
            <a href="/in/example/details/experience/?profilePosition=duplicate-position">
              <span aria-hidden="true"><strong>Incomplete duplicate</strong></span>
            </a>
            <span aria-hidden="true">Example Corp · CDI</span>
          </div>
        </section>
      </main>
    `);

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences.map((experience) => experience.title)).toEqual([
      'Canonical Engineer',
    ]);
  });

  it('keeps inherited company separate from date when grouped roles omit employment type', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_company:acme">
              <span aria-hidden="true"><strong>Acme</strong></span>
              <span aria-hidden="true">4 ans</span>
              <ul class="pvs-list">
                <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:no-type">
                  <span aria-hidden="true"><strong>Principal Engineer</strong></span>
                  <span aria-hidden="true">janv. 2024 – aujourd’hui · 2 ans</span>
                  <span aria-hidden="true">Paris, Île-de-France, France</span>
                </li>
                <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:with-type">
                  <span aria-hidden="true"><strong>Staff Engineer</strong></span>
                  <span aria-hidden="true">CDI</span>
                  <span aria-hidden="true">janv. 2022 – déc. 2023 · 2 ans</span>
                  <span aria-hidden="true">Lyon, Auvergne-Rhône-Alpes, France</span>
                </li>
              </ul>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences).toEqual([
      expect.objectContaining({
        title: 'Principal Engineer',
        company: 'Acme',
        dateRange: 'janv. 2024 – aujourd’hui',
      }),
      expect.objectContaining({
        title: 'Staff Engineer',
        company: 'Acme',
        employmentType: 'CDI',
        dateRange: 'janv. 2022 – déc. 2023',
      }),
    ]);
    expect(snapshot.experiences[0]).not.toHaveProperty('employmentType');
    expect(snapshot.experiences[0]?.company).not.toMatch(/2024|aujourd’hui/);
  });

  it('waits through an Add position action when lazy position rows appear', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <h1>Experience</h1>
          <button type="button">Add position</button>
          <ul class="pvs-list"></ul>
        </section>
      </main>
    `);
    const list = document.querySelector('.pvs-list');
    if (!list) {
      throw new Error('expected list');
    }
    window.setTimeout(() => {
      list.insertAdjacentHTML('beforeend', standaloneRow('lazy-after-add', 'Lazy Role'));
    }, 3);

    const snapshot = await extract({ observationMs: 5, stableCycles: 2 });

    expect(snapshot.kind).toBe('ready');
    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences.map((experience) => experience.title)).toEqual(['Lazy Role']);
  });

  it('recognizes a structurally explicit empty state only after loader-free stabilization', async () => {
    render(EMPTY_FIXTURE);
    const root = document.querySelector('#experience');
    if (!root) {
      throw new Error('expected experience root');
    }
    root.insertAdjacentHTML('beforeend', '<div aria-busy="true">Chargement</div>');
    let loaderRemoved = false;
    window.setTimeout(() => {
      root.querySelector('[aria-busy="true"]')?.remove();
      loaderRemoved = true;
    }, 3);

    await expect(extract({ observationMs: 5, stableCycles: 2 })).resolves.toEqual({
      kind: 'empty',
      experiences: [],
    });
    expect(loaderRemoved).toBe(true);
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

  it.each([
    ['Skills: TypeScript · Svelte', ['TypeScript', 'Svelte']],
    ['Compétences : Java · Apache Kafka', ['Java', 'Apache Kafka']],
  ])('extracts an exact colon-delimited skills label: %s', async (skillsLine, expectedSkills) => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:skills-colon">
              <span aria-hidden="true"><strong>Technical Lead</strong></span>
              <span aria-hidden="true">Example Corp · Freelance</span>
              <span aria-hidden="true">janv. 2024 – aujourd’hui</span>
              <span aria-hidden="true">Paris, France</span>
              <span aria-hidden="true">${skillsLine}</span>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.skills).toEqual(expectedSkills);
  });

  it('keeps prose beginning with Skills in the description and uses only the exact label', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:skills-description">
              <span aria-hidden="true"><strong>Engineering Manager</strong></span>
              <span aria-hidden="true">Example Corp · CDI</span>
              <span aria-hidden="true">janv. 2022 – aujourd’hui</span>
              <span aria-hidden="true">Paris, France</span>
              <span aria-hidden="true">Skills developed while leading the platform migration.</span>
              <span aria-hidden="true">Skills: Leadership · Architecture</span>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.description).toBe(
      'Skills developed while leading the platform migration.'
    );
    expect(snapshot.experiences[0]?.skills).toEqual(['Leadership', 'Architecture']);
  });

  it('recognizes a standalone exact Skills label without treating it as description prose', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:skills-label-only">
              <span aria-hidden="true"><strong>Engineer</strong></span>
              <span aria-hidden="true">Example Corp · CDI</span>
              <span aria-hidden="true">janv. 2022 – aujourd’hui</span>
              <span aria-hidden="true">Paris, France</span>
              <span aria-hidden="true">Skills</span>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.skills).toEqual([]);
    expect(snapshot.experiences[0]?.description).toBeUndefined();
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

  it('returns unreadable after observing zero rows without a structural empty signal', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <h1>Expérience</h1>
          <button type="button">Ajouter un poste</button>
          <ul class="pvs-list"></ul>
        </section>
      </main>
    `);

    await expect(extract({ stabilizationTimeoutMs: 15, observationMs: 2 })).resolves.toEqual({
      kind: 'unreadable',
      experiences: [],
    });
  });
});
