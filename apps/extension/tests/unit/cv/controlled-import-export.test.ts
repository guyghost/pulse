import { describe, expect, it } from 'vitest';
import type { Experience, UserProfile } from '../../../src/lib/core/types/profile';
import type { CandidateExperienceDraft } from '../../../src/lib/core/profile-extractors/types';
import {
  mergeExperiences,
  previewExperienceImport,
} from '../../../src/lib/core/cv/experience-helpers';
import {
  buildCvDocument,
  renderCvHtml,
  suggestCvOrder,
} from '../../../src/lib/core/cv/export-document';

const exp: Experience = {
  id: 'canonical',
  title: 'Developer',
  company: 'A',
  startDate: '2023-01',
  endDate: null,
  isCurrent: true,
  description: 'Existing work',
  location: 'Paris',
  employmentType: 'Freelance',
  skills: ['TypeScript'],
  source: 'linkedin',
  sourceExternalId: 'linkedin-experience-0',
  positionIndex: 0,
  updatedAt: 42,
};
const draft = (overrides: Partial<CandidateExperienceDraft> = {}): CandidateExperienceDraft => ({
  ...exp,
  ...overrides,
});

describe('controlled experience import', () => {
  it('groups duplicate incoming identities into the exact final proposed facts', () => {
    const incoming = [
      draft({ description: 'First description', skills: ['TypeScript'] }),
      draft({
        title: ' developer ',
        company: ' A ',
        startDate: '2023-1-01',
        sourceExternalId: 'linkedin-experience-1',
        description: 'Second description',
        skills: ['React'],
      }),
    ];
    const rows = previewExperienceImport([], incoming);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('new');
    expect(rows[0].proposed.description).toBe('Second description');
    expect(rows[0].proposed.skills).toEqual(['TypeScript', 'React']);
    expect(
      mergeExperiences(
        [],
        rows.map((row) => row.draft),
        0
      )
    ).toEqual(mergeExperiences([], incoming, 0));
    const manual = { ...exp, source: 'manual' as const };
    const manualRows = previewExperienceImport([manual], incoming);
    expect(manualRows).toHaveLength(1);
    expect(manualRows[0].status).toBe('identical');
    expect(manualRows[0].proposed).toEqual(manual);
  });

  it('previews the actual approved end-date update without mutating current facts', () => {
    const incoming = draft({
      isCurrent: false,
      endDate: '2026-09-30',
      description: 'Completed work',
    });
    const [preview] = previewExperienceImport([exp], [incoming]);
    expect(preview.status).toBe('modified');
    expect(preview.proposed).toMatchObject({
      id: 'canonical',
      sourceExternalId: 'linkedin-experience-0',
      isCurrent: false,
      endDate: '2026-09',
      updatedAt: 42,
    });
    expect(mergeExperiences([exp], [incoming], 100)[0]).toEqual(preview.proposed);
    expect(exp.isCurrent).toBe(true);
    expect(previewExperienceImport([preview.proposed], [incoming])[0].status).toBe('identical');
  });
  it('ignores reordered positional LinkedIn IDs and preserves unrelated/manual records', () => {
    const second = {
      ...exp,
      id: 'other',
      company: 'B',
      sourceExternalId: 'linkedin-experience-1',
      positionIndex: 1,
    };
    const manual = {
      ...exp,
      id: 'manual',
      source: 'manual' as const,
      company: 'C',
      positionIndex: 2,
    };
    const merged = mergeExperiences(
      [exp, second, manual],
      [
        draft({ company: 'B', description: 'B update', sourceExternalId: 'linkedin-experience-0' }),
        draft({ company: 'A', sourceExternalId: 'linkedin-experience-1' }),
      ],
      100
    );
    expect(merged).toHaveLength(3);
    expect(merged.find((item) => item.id === 'canonical')).toEqual(exp);
    expect(merged.find((item) => item.id === 'other')).toMatchObject({
      company: 'B',
      description: 'B update',
      sourceExternalId: 'linkedin-experience-1',
    });
    expect(merged.find((item) => item.id === 'manual')).toEqual(manual);
    expect(
      mergeExperiences(
        merged,
        [draft({ company: 'B', sourceExternalId: 'linkedin-experience-9' })],
        200
      )
    ).toHaveLength(3);
  });
  it('matches a stable external ID after corrections and preserves canonical identity', () => {
    const current = { ...exp, sourceExternalId: 'urn:li:position:123' };
    expect(
      mergeExperiences(
        [current],
        [draft({ title: 'Corrected title', sourceExternalId: current.sourceExternalId })],
        100
      )
    ).toMatchObject([
      { id: current.id, title: 'Corrected title', sourceExternalId: current.sourceExternalId },
    ]);
  });
  it('deduplicates normalized dates, spaces, incoming duplicates and preserves manual metadata', () => {
    const manual = { ...exp, source: 'manual' as const };
    const incoming = draft({
      company: ' A ',
      title: ' developer ',
      startDate: '2023-1-04',
      skills: ['Imaginary'],
      description: 'Replacement',
    });
    expect(mergeExperiences([manual], [incoming, incoming], 100)).toEqual([manual]);
    expect(previewExperienceImport([manual], [incoming])[0].status).toBe('identical');
    expect(mergeExperiences([], [incoming, incoming], 100)).toHaveLength(1);
  });
});

describe('local printable CV', () => {
  const profile: UserProfile = {
    firstName: 'Alice',
    jobTitle: 'Actual role',
    keywords: ['Desired skill'],
    location: 'Lyon',
    tjmMin: 500,
    tjmMax: null,
    remote: 'any',
    seniority: 'senior',
    experiences: [exp],
    availability: null,
  };
  it('only includes owned skills and selected existing experiences, retaining the real job title', () => {
    const doc = buildCvDocument(
      profile,
      null,
      [exp.id, 'unknown'],
      ['TypeScript', 'Desired skill', 'Invented'],
      'My introduction'
    );
    expect(doc.skills).toEqual(['TypeScript']);
    expect(doc.title).toBe('Actual role');
    expect(doc.experiences).toHaveLength(1);
    expect(doc.applicationContext).toBe('');
    expect(buildCvDocument(profile, null, [], [], '').experiences).toEqual([]);
    expect(suggestCvOrder(profile.experiences, null)).toEqual(profile.experiences);
  });
  it('renders hostile HTML and URLs as inert text with no scripts, links or external resources', () => {
    const hostile =
      '</style><script>alert(1)</script><img src="https://evil.test/x" onerror="alert(1)">javascript:alert(2)&"';
    const doc = buildCvDocument(
      {
        ...profile,
        firstName: hostile,
        jobTitle: hostile,
        location: hostile,
        experiences: [
          { ...exp, title: hostile, company: hostile, description: hostile, skills: [hostile] },
        ],
      },
      null,
      [exp.id],
      [hostile],
      hostile
    );
    const html = renderCvHtml(doc);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    expect(parsed.querySelectorAll('script,img,iframe,link,a,[src],[href],[onerror]')).toHaveLength(
      0
    );
    expect(parsed.querySelector('h1')?.textContent).toBe(hostile);
    expect(html).toContain('&lt;script&gt;');
    expect(parsed.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain(
      "default-src 'none'"
    );
  });
});
