import { describe, expect, it } from 'vitest';
import { parseLinkedInProfilePayload } from '../../../src/lib/core/profile-extractors/linkedin-parser';
import { parseProfileDateRange } from '../../../src/lib/core/profile-extractors/normalize-candidate-profile';

const capturedAt = new Date('2026-05-22T08:00:00.000Z');

describe('linkedin profile parser', () => {
  it('normalizes a sanitized LinkedIn profile payload into a canonical CV draft', () => {
    const result = parseLinkedInProfilePayload({
      source: 'linkedin',
      profileUrl: 'https://www.linkedin.com/in/guy-mandina/',
      capturedAt,
      sections: {
        headline: 'Lead Frontend Svelte / TypeScript',
        summary: 'Consultant frontend senior.\nDesign systems et extensions Chrome.',
        experiences: [
          {
            title: 'Lead Frontend',
            company: 'ScaleOps',
            location: 'Paris',
            dateRange: 'Jan 2021 - Present',
            description: 'Migration Svelte 5',
            skills: ['Svelte', 'TypeScript', 'Svelte'],
            externalId: 'experience-1',
          },
        ],
        skills: ['TypeScript', 'Architecture frontend'],
        education: [
          {
            school: 'Université Paris Cité',
            degree: 'Master',
            field: 'Informatique',
            dateRange: '2014 - 2016',
          },
        ],
        links: [{ label: 'Portfolio', url: 'https://example.com' }],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toMatchObject({
      title: 'Lead Frontend Svelte / TypeScript',
      summary: 'Consultant frontend senior.\nDesign systems et extensions Chrome.',
      source: 'linkedin',
      capturedAt: '2026-05-22T08:00:00.000Z',
      profileUrl: 'https://www.linkedin.com/in/guy-mandina/',
      confidence: 1,
    });
    expect(result.value.experiences).toEqual([
      {
        title: 'Lead Frontend',
        company: 'ScaleOps',
        location: 'Paris',
        startDate: '2021-01-01',
        endDate: null,
        isCurrent: true,
        description: 'Migration Svelte 5',
        skills: ['Svelte', 'TypeScript'],
        source: 'linkedin',
        sourceExternalId: 'experience-1',
        positionIndex: 0,
      },
    ]);
    expect(result.value.skills.map((skill) => skill.skill)).toEqual([
      'TypeScript',
      'Architecture frontend',
      'Svelte',
    ]);
    expect(result.value.education[0]).toMatchObject({
      school: 'Université Paris Cité',
      degree: 'Master',
      field: 'Informatique',
      startDate: '2014-01-01',
      endDate: '2016-01-01',
    });
    expect(result.value.links).toEqual([
      { label: 'Portfolio', url: 'https://example.com', source: 'linkedin' },
    ]);
  });

  it('tolerates missing optional sections', () => {
    const result = parseLinkedInProfilePayload({
      source: 'linkedin',
      profileUrl: 'https://www.linkedin.com/in/example/',
      capturedAt,
      sections: {
        headline: 'Freelance frontend',
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.experiences).toEqual([]);
      expect(result.value.skills).toEqual([]);
      expect(result.value.confidence).toBe(0.2);
    }
  });

  it('returns a typed dom_changed error when the sanitized payload is empty', () => {
    const result = parseLinkedInProfilePayload({
      source: 'linkedin',
      profileUrl: 'https://www.linkedin.com/in/example/',
      capturedAt,
      sections: {},
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'dom_changed',
        message: 'LinkedIn payload did not include enough profile fields to build a CV draft.',
        field: 'sections',
      },
    });
  });

  it('rejects malformed payloads without throwing', () => {
    expect(parseLinkedInProfilePayload(null)).toMatchObject({
      ok: false,
      error: { code: 'malformed_payload' },
    });
    expect(
      parseLinkedInProfilePayload({
        source: 'other',
        profileUrl: 'https://www.linkedin.com/in/example/',
        capturedAt,
        sections: {},
      })
    ).toMatchObject({
      ok: false,
      error: { code: 'unsupported_source', field: 'source' },
    });
  });
});

describe('profile date range parser', () => {
  it('parses English and French month ranges without ambient time', () => {
    expect(parseProfileDateRange('Feb 2020 - Aug 2022')).toEqual({
      startDate: '2020-02-01',
      endDate: '2022-08-01',
      isCurrent: false,
    });
    expect(parseProfileDateRange('févr. 2020 - aujourd’hui')).toEqual({
      startDate: '2020-02-01',
      endDate: null,
      isCurrent: true,
    });
  });
});
