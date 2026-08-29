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

  it('keeps owner-view sibling descriptions inside their generated position card', async () => {
    render(`
      <main>
        <section>
          <h1>Expérience</h1>
          <div class="generated-list-wrapper">
            <div class="generated-position-wrapper">
              <div class="generated-position-content">
                <a href="/in/guyghost/details/experience/edit/forms/2397304299/">
                  <p>Technical Lead</p>
                  <p>BNP Paribas Personal Finance · Freelance</p>
                  <p>janv. 2023 - oct. 2025 · 2 ans 10 mois</p>
                  <p>Levallois-Perret, Île-de-France, France · Hybride</p>
                </a>
                <div><p>Pilotage de la migration des projets vers le cloud.</p></div>
              </div>
              <a href="/in/guyghost/details/experience/edit/forms/2397304299/">
                Modifier Technical Lead chez BNP Paribas Personal Finance
              </a>
            </div>
            <div class="generated-position-wrapper">
              <div class="generated-position-content">
                <a href="/in/guyghost/details/experience/edit/forms/1749359532/">
                  <p>Software Engineer</p>
                  <p>Hackages · CDI</p>
                  <p>mars 2019 - sept. 2022 · 3 ans 7 mois</p>
                  <p>Amsterdam, Pays-Bas</p>
                </a>
                <div><p>Construction de plateformes web distribuées.</p></div>
              </div>
              <a href="/in/guyghost/details/experience/edit/forms/1749359532/">
                Modifier Software Engineer chez Hackages
              </a>
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
        location: 'Levallois-Perret, Île-de-France, France · Hybride',
        description: 'Pilotage de la migration des projets vers le cloud.',
      }),
      expect.objectContaining({
        title: 'Software Engineer',
        location: 'Amsterdam, Pays-Bas',
        description: 'Construction de plateformes web distribuées.',
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

  it('keeps a structural description when LinkedIn emits it before the location', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:description-before-location">
              <span aria-hidden="true"><strong>Technical Lead</strong></span>
              <span aria-hidden="true">Example Corp · Freelance</span>
              <span aria-hidden="true">janv. 2023 – oct. 2025 · 2 ans 10 mois</span>
              <span aria-hidden="true">Pilotage de la plateforme de paiement.</span>
              <span aria-hidden="true">Paris · Hybride</span>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.location).toBe('Paris · Hybride');
    expect(snapshot.experiences[0]?.description).toBe('Pilotage de la plateforme de paiement.');
  });

  it('keeps a structural description when the LinkedIn position has no location', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:description-without-location">
              <span aria-hidden="true"><strong>Engineering Manager</strong></span>
              <span aria-hidden="true">Example Corp · CDI</span>
              <span aria-hidden="true">janv. 2022 – aujourd’hui</span>
              <span aria-hidden="true">Direction d'une équipe produit distribuée.</span>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.location).toBeUndefined();
    expect(snapshot.experiences[0]?.description).toBe("Direction d'une équipe produit distribuée.");
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

  it('extracts a multi-paragraph description rendered as prose blocks outside aria-hidden spans', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:prose-description">
              <a data-view-name="profile-component-entity" href="/in/guyghost/details/experience/901/?profilePosition=901">
                <div class="display-flex flex-column justify-content-center">
                  <span aria-hidden="true"><strong>Technical Lead</strong></span>
                  <span aria-hidden="true">BNP Paribas Personal Finance · Freelance</span>
                  <span aria-hidden="true">janv. 2023 - oct. 2025 · 2 ans 10 mois</span>
                  <span aria-hidden="true">Levallois-Perret, Île-de-France, France · Hybride</span>
                  <div class="pvs-entity__sub-components">
                    <div class="pvs-entity__description-wrapper">
                      <p class="text-body-small">Refonte du SI de paiement.</p>
                      <p class="text-body-small">Mise en place d'une équipe de 8 personnes.</p>
                    </div>
                  </div>
                </div>
              </a>
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
      "Refonte du SI de paiement.\nMise en place d'une équipe de 8 personnes."
    );
    expect(snapshot.experiences[0]?.location).toBe(
      'Levallois-Perret, Île-de-France, France · Hybride'
    );
  });

  it('keeps a prose-wrapped location out of the imported description', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:prose-location">
              <a data-view-name="profile-component-entity" href="/in/guyghost/details/experience/908/?profilePosition=908">
                <span aria-hidden="true"><strong>Technical Lead</strong></span>
                <span aria-hidden="true">Example Corp · Freelance</span>
                <span aria-hidden="true">janv. 2023 - oct. 2025 · 2 ans 10 mois</span>
                <div class="pvs-entity__sub-components">
                  <p class="text-body-small">
                    <span aria-hidden="true">Levallois-Perret, Île-de-France, France · Hybride</span>
                  </p>
                  <p class="text-body-small">Pilotage de la plateforme de paiement.</p>
                </div>
              </a>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.location).toBe(
      'Levallois-Perret, Île-de-France, France · Hybride'
    );
    expect(snapshot.experiences[0]?.description).toBe('Pilotage de la plateforme de paiement.');
  });

  it('recognizes LinkedIn localized surrounding-area text as a location', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:surrounding-area">
              <span aria-hidden="true"><strong>Software Engineer</strong></span>
              <span aria-hidden="true">Example Corp · CDI</span>
              <span aria-hidden="true">juil. 2017 – mars 2019 · 1 an 9 mois</span>
              <span aria-hidden="true">Paris et périphérie</span>
              <p>Construction de plateformes web distribuées.</p>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.location).toBe('Paris et périphérie');
    expect(snapshot.experiences[0]?.description).toBe(
      'Construction de plateformes web distribuées.'
    );
  });

  it('does not turn prose ending with a work-mode marker into a location', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:remote-prose">
              <span aria-hidden="true"><strong>Engineering Manager</strong></span>
              <span aria-hidden="true">Example Corp · CDI</span>
              <span aria-hidden="true">janv. 2022 – aujourd’hui</span>
              <div class="pvs-entity__sub-components">
                <p class="text-body-small">Led distributed teams · Remote</p>
              </div>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.location).toBeUndefined();
    expect(snapshot.experiences[0]?.description).toBe('Led distributed teams · Remote');
  });

  it('splits aria-hidden paragraphs and drops the expanded show-less action', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:aria-paragraphs">
              <span aria-hidden="true"><strong>Technical Lead</strong></span>
              <span aria-hidden="true">Example Corp · Freelance</span>
              <span aria-hidden="true">janv. 2023 - oct. 2025 · 2 ans 10 mois</span>
              <span aria-hidden="true">Paris, France</span>
              <span aria-hidden="true"><p>Refonte du SI.</p><p>Équipe de 8.</p></span>
              <span aria-hidden="true">…voir moins</span>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.description).toBe('Refonte du SI.\nÉquipe de 8.');
  });

  it('reads skills from a visually-hidden label with aria-hidden values inside a prose block', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:skills-prose">
              <a data-view-name="profile-component-entity" href="/in/guyghost/details/experience/902/?profilePosition=902">
                <span aria-hidden="true"><strong>Technical Lead</strong></span>
                <span aria-hidden="true">BNP Paribas Personal Finance · Freelance</span>
                <span aria-hidden="true">janv. 2023 - oct. 2025 · 2 ans 10 mois</span>
                <span aria-hidden="true">Levallois-Perret, Île-de-France, France · Hybride</span>
                <div class="pvs-entity__sub-components">
                  <p class="pv-skill-entity">
                    <span class="visually-hidden">Compétences&nbsp;:</span>
                    <span aria-hidden="true">Java · Apache Kafka · Spring Boot</span>
                  </p>
                </div>
              </a>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.skills).toEqual(['Java', 'Apache Kafka', 'Spring Boot']);
    expect(snapshot.experiences[0]?.description).toBeUndefined();
  });

  it('strips nested buttons, svg, and hidden descendants from prose descriptions', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:prose-nested-chrome">
              <a data-view-name="profile-component-entity" href="/in/guyghost/details/experience/903/?profilePosition=903">
                <span aria-hidden="true"><strong>Technical Lead</strong></span>
                <span aria-hidden="true">Example Corp · Freelance</span>
                <span aria-hidden="true">janv. 2023 - oct. 2025 · 2 ans 10 mois</span>
                <span aria-hidden="true">Paris, France</span>
                <div class="pvs-entity__sub-components">
                  <p class="text-body-small">
                    Refonte du SI de paiement.
                    <span class="sr-only">confidentiel</span>
                    <svg aria-hidden="true"><title>icône</title></svg>
                    <button type="button">…voir plus</button>
                  </p>
                </div>
              </a>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.description).toBe('Refonte du SI de paiement.');
  });

  it('keeps the truncated text of a collapsed prose description and drops the hidden duplicate', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:prose-collapsed">
              <a data-view-name="profile-component-entity" href="/in/guyghost/details/experience/905/?profilePosition=905">
                <span aria-hidden="true"><strong>Technical Lead</strong></span>
                <span aria-hidden="true">Example Corp · Freelance</span>
                <span aria-hidden="true">janv. 2023 - oct. 2025 · 2 ans 10 mois</span>
                <span aria-hidden="true">Paris, France</span>
                <div class="pvs-entity__sub-components">
                  <p class="text-body-small">
                    <span aria-hidden="true">Refonte du SI de paiement…</span>
                    <span class="visually-hidden">Refonte du SI de paiement. Mise en place d'une équipe de 8 personnes.</span>
                  </p>
                </div>
              </a>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.location).toBe('Paris, France');
    expect(snapshot.experiences[0]?.description).toBe('Refonte du SI de paiement…');
  });

  it('keeps prose as description when the position has no location line', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:prose-no-location">
              <a data-view-name="profile-component-entity" href="/in/guyghost/details/experience/906/?profilePosition=906">
                <span aria-hidden="true"><strong>Technical Lead</strong></span>
                <span aria-hidden="true">Example Corp · Freelance</span>
                <span aria-hidden="true">janv. 2023 - oct. 2025 · 2 ans 10 mois</span>
                <div class="pvs-entity__sub-components">
                  <p class="text-body-small">Refonte du SI de paiement.</p>
                  <p class="text-body-small">Mise en place d'une équipe de 8 personnes.</p>
                </div>
              </a>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]?.location).toBeUndefined();
    expect(snapshot.experiences[0]?.description).toBe(
      "Refonte du SI de paiement.\nMise en place d'une équipe de 8 personnes."
    );
  });

  it('reads structural fields through the fallback when only prose blocks carry extra text', async () => {
    render(`
      <main data-testid="experience-detail-root">
        <section id="experience">
          <ul class="pvs-list">
            <li class="pvs-list__paged-list-item" data-entity-urn="urn:li:fsd_profilePosition:hybrid-plain">
              <a data-view-name="profile-component-entity" href="/in/guyghost/details/experience/907/?profilePosition=907">
                <div class="display-flex flex-column">
                  <strong>Technical Lead</strong>
                  <span>Example Corp · Freelance</span>
                  <span>janv. 2023 - oct. 2025</span>
                  <div class="pvs-entity__sub-components">
                    <p class="text-body-small">Refonte du SI.</p>
                  </div>
                </div>
              </a>
            </li>
          </ul>
        </section>
      </main>
    `);

    const snapshot = await extract();

    if (snapshot.kind !== 'ready') {
      throw new Error('expected ready');
    }
    expect(snapshot.experiences[0]).toMatchObject({
      title: 'Technical Lead',
      company: 'Example Corp',
      employmentType: 'Freelance',
      dateRange: 'janv. 2023 - oct. 2025',
      description: 'Refonte du SI.',
    });
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
