import { describe, it, expect } from 'vitest';
import {
  parseCollectiveProjects,
  extractCollectiveProjects,
  type CollectiveProject,
} from '../../../src/lib/core/connectors/collective-parser';

const NOW = new Date('2026-03-14T12:00:00Z');

const makeProject = (overrides: Partial<CollectiveProject> = {}): CollectiveProject => ({
  id: 'cmmq3g2742fdd3ujib0q31f8f',
  slug: 'pmo-dun-chantier-dintegration-it-6xd7',
  name: "PMO d'un chantier d'intégration IT",
  sumUp: 'Mission de PMO pour un chantier IT complexe.',
  description: '<p>Description HTML complète</p>',
  budgetBrief: '400-450€ (Journalier)',
  workPreferences: ['HYBRID'],
  isPermanentContract: false,
  idealStartDate: 'ASAP',
  projectTypes: ['DOCKER', 'DEVOPS', 'AWS'],
  publishedAt: '2026-03-14T10:00:00.000Z',
  company: { name: 'Acme Corp', logoUrl: null },
  location: { fullNameFrench: 'Paris, France', fullNameEnglish: 'Paris, France' },
  ...overrides,
});

describe('parseCollectiveProjects', () => {
  it('parses a standard project into a Mission', () => {
    const missions = parseCollectiveProjects([makeProject()], NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0]).toMatchObject({
      id: 'col-cmmq3g2742fdd3ujib0q31f8f',
      title: "PMO d'un chantier d'intégration IT",
      client: 'Acme Corp',
      description: 'Mission de PMO pour un chantier IT complexe.',
      stack: ['DOCKER', 'DEVOPS', 'AWS'],
      tjm: 400,
      location: 'Paris, France',
      remote: 'hybrid',
      duration: null,
      url: 'https://www.collective.work/job/pmo-dun-chantier-dintegration-it-6xd7',
      source: 'collective',
      scrapedAt: NOW,
      score: null,
      semanticScore: null,
      semanticReason: null,
    });
  });

  it('returns empty array for empty input', () => {
    expect(parseCollectiveProjects([], NOW)).toEqual([]);
  });

  it('parses multiple projects', () => {
    const projects = [
      makeProject({ id: 'aaa', slug: 'mission-a', name: 'Mission A' }),
      makeProject({ id: 'bbb', slug: 'mission-b', name: 'Mission B' }),
    ];
    const missions = parseCollectiveProjects(projects, NOW);
    expect(missions).toHaveLength(2);
    expect(missions[0].id).toBe('col-aaa');
    expect(missions[1].id).toBe('col-bbb');
  });

  // --- TJM extraction ---
  it('extracts TJM from "400-450€ (Journalier)"', () => {
    const missions = parseCollectiveProjects([makeProject({ budgetBrief: '400-450€ (Journalier)' })], NOW);
    expect(missions[0].tjm).toBe(400);
  });

  it('extracts TJM from "600/700"', () => {
    const missions = parseCollectiveProjects([makeProject({ budgetBrief: '600/700' })], NOW);
    expect(missions[0].tjm).toBe(600);
  });

  it('extracts TJM from plain number "400"', () => {
    const missions = parseCollectiveProjects([makeProject({ budgetBrief: '400' })], NOW);
    expect(missions[0].tjm).toBe(400);
  });

  it('extracts TJM from "TJM HT max 636 €"', () => {
    const missions = parseCollectiveProjects([makeProject({ budgetBrief: 'TJM HT max 636 €' })], NOW);
    expect(missions[0].tjm).toBe(636);
  });

  it('returns null TJM for "selon profil"', () => {
    const missions = parseCollectiveProjects([makeProject({ budgetBrief: 'selon profil' })], NOW);
    expect(missions[0].tjm).toBeNull();
  });

  it('returns null TJM when budgetBrief is null', () => {
    const missions = parseCollectiveProjects([makeProject({ budgetBrief: null })], NOW);
    expect(missions[0].tjm).toBeNull();
  });

  // --- Remote mapping ---
  it('maps REMOTE to "full"', () => {
    const missions = parseCollectiveProjects([makeProject({ workPreferences: ['REMOTE'] })], NOW);
    expect(missions[0].remote).toBe('full');
  });

  it('maps HYBRID to "hybrid"', () => {
    const missions = parseCollectiveProjects([makeProject({ workPreferences: ['HYBRID'] })], NOW);
    expect(missions[0].remote).toBe('hybrid');
  });

  it('maps ON_SITE to "onsite"', () => {
    const missions = parseCollectiveProjects([makeProject({ workPreferences: ['ON_SITE'] })], NOW);
    expect(missions[0].remote).toBe('onsite');
  });

  it('prioritizes REMOTE over HYBRID', () => {
    const missions = parseCollectiveProjects([makeProject({ workPreferences: ['HYBRID', 'REMOTE'] })], NOW);
    expect(missions[0].remote).toBe('full');
  });

  it('prioritizes HYBRID over ON_SITE', () => {
    const missions = parseCollectiveProjects([makeProject({ workPreferences: ['ON_SITE', 'HYBRID'] })], NOW);
    expect(missions[0].remote).toBe('hybrid');
  });

  it('returns null remote for empty workPreferences', () => {
    const missions = parseCollectiveProjects([makeProject({ workPreferences: [] })], NOW);
    expect(missions[0].remote).toBeNull();
  });

  // --- Skill mapping ---
  it('maps DOT_NET to .NET', () => {
    const missions = parseCollectiveProjects([makeProject({ projectTypes: ['DOT_NET'] })], NOW);
    expect(missions[0].stack).toEqual(['.NET']);
  });

  it('maps C_SHARP to C#', () => {
    const missions = parseCollectiveProjects([makeProject({ projectTypes: ['C_SHARP'] })], NOW);
    expect(missions[0].stack).toEqual(['C#']);
  });

  it('maps A_B_TESTING to A/B Testing', () => {
    const missions = parseCollectiveProjects([makeProject({ projectTypes: ['A_B_TESTING'] })], NOW);
    expect(missions[0].stack).toEqual(['A/B Testing']);
  });

  it('replaces underscores with spaces for unknown skills', () => {
    const missions = parseCollectiveProjects([makeProject({ projectTypes: ['SPRING_BOOT'] })], NOW);
    expect(missions[0].stack).toEqual(['SPRING BOOT']);
  });

  // --- Nullable fields ---
  it('handles null company', () => {
    const missions = parseCollectiveProjects([makeProject({ company: null })], NOW);
    expect(missions[0].client).toBeNull();
  });

  it('handles null location', () => {
    const missions = parseCollectiveProjects([makeProject({ location: null })], NOW);
    expect(missions[0].location).toBeNull();
  });

  it('falls back to empty string when sumUp is null', () => {
    const missions = parseCollectiveProjects([makeProject({ sumUp: null })], NOW);
    expect(missions[0].description).toBe('');
  });
});

describe('extractCollectiveProjects', () => {
  it('extracts projects from __NEXT_DATA__ script tag', () => {
    const projects = [makeProject()];
    const html = `
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">
          {"props":{"pageProps":{"dehydratedState":{"queries":[{"state":{"data":{"results":{"projects":${JSON.stringify(projects)},"pagination":{"from":0,"total":100}}}}}]}}}}
        </script>
      </body></html>
    `;
    const result = extractCollectiveProjects(html);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('cmmq3g2742fdd3ujib0q31f8f');
  });

  it('returns empty array when no __NEXT_DATA__ found', () => {
    const html = '<html><body></body></html>';
    expect(extractCollectiveProjects(html)).toEqual([]);
  });

  it('returns empty array for malformed JSON', () => {
    const html = '<html><body><script id="__NEXT_DATA__">{broken json</script></body></html>';
    expect(extractCollectiveProjects(html)).toEqual([]);
  });

  it('returns empty array when projects key is missing', () => {
    const html = '<html><body><script id="__NEXT_DATA__">{"props":{"pageProps":{}}}</script></body></html>';
    expect(extractCollectiveProjects(html)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Malformed project data hardening tests
  // ---------------------------------------------------------------------------

  it('extractCollectiveProjects validates and filters invalid entries', () => {
    // extractCollectiveProjects validates each entry:
    // - must be an object (typeof p !== 'object' || p === null)
    // - must have string id and name
    const projects = [
      null,
      { id: 'valid-1', slug: 'valid', name: 'Valid' },
      'not-an-object',
      123,
      { id: null, name: 'Invalid' },
      { id: 'valid-2', slug: 'valid', name: 'Another Valid' },
    ];
    const html = `
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">
          {"props":{"pageProps":{"dehydratedState":{"queries":[{"state":{"data":{"results":{"projects":${JSON.stringify(projects)}}}}}]}}}}
        </script>
      </body></html>
    `;
    const result = extractCollectiveProjects(html);
    // Only valid objects with string id and name pass validation
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'valid-1' });
    expect(result[1]).toMatchObject({ id: 'valid-2' });
  });

  it('parseCollectiveProjects handles filtered entries correctly', () => {
    // After extractCollectiveProjects filters, parseCollectiveProjects processes valid entries
    const validProjects: CollectiveProject[] = [
      makeProject({ id: 'valid-1' }),
      makeProject({ id: 'valid-2', name: 'Another' }),
    ];
    
    const missions = parseCollectiveProjects(validProjects, NOW);
    
    expect(missions).toHaveLength(2);
    expect(missions[0].id).toBe('col-valid-1');
    expect(missions[1].id).toBe('col-valid-2');
  });

  it('handles project with null optional fields', () => {
    const projectWithNulls: CollectiveProject = {
      id: 'test',
      slug: 'test-slug',
      name: 'Test',
      sumUp: null,
      description: null,
      budgetBrief: null,
      workPreferences: [],
      isPermanentContract: false,
      idealStartDate: null,
      projectTypes: [],
      publishedAt: '2026-03-14T10:00:00.000Z',
      company: null,
      location: null,
    };

    const missions = parseCollectiveProjects([projectWithNulls], NOW);
    
    expect(missions).toHaveLength(1);
    expect(missions[0].client).toBeNull();
    expect(missions[0].location).toBeNull();
    expect(missions[0].tjm).toBeNull();
    expect(missions[0].description).toBe('');
    expect(missions[0].remote).toBeNull();
    expect(missions[0].stack).toEqual([]);
  });

  it('handles project with empty strings', () => {
    const projectWithEmpty: CollectiveProject = {
      ...makeProject(),
      name: '',
      slug: '',
      sumUp: '',
    };

    const missions = parseCollectiveProjects([projectWithEmpty], NOW);
    
    expect(missions).toHaveLength(1);
    expect(missions[0].title).toBe('');
    expect(missions[0].description).toBe('');
  });

  it('handles deeply nested missing path in __NEXT_DATA__', () => {
    const html = `
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">
          {"props":{"pageProps":{"dehydratedState":{"queries":[]}}}}
        </script>
      </body></html>
    `;
    expect(extractCollectiveProjects(html)).toEqual([]);
  });

  it('handles __NEXT_DATA__ with queries but no state', () => {
    const html = `
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">
          {"props":{"pageProps":{"dehydratedState":{"queries":[{"other":"data"}]}}}}
        </script>
      </body></html>
    `;
    expect(extractCollectiveProjects(html)).toEqual([]);
  });
});
