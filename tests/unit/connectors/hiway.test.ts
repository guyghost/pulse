import { describe, it, expect } from 'vitest';
import { parseHiwayHTML } from '../../../src/lib/core/connectors/hiway-parser';

const NOW = new Date('2026-03-15T12:00:00Z');

function makeCard(overrides: {
  uuid?: string;
  title?: string;
  company?: string;
  tjm?: string;
  location?: string;
  duration?: string;
  tags?: string[];
} = {}): string {
  const uuid = overrides.uuid ?? '550e8400-e29b-41d4-a716-446655440000';
  const title = overrides.title ?? 'Dev React Senior';
  const company = overrides.company ?? 'Acme Corp';
  const tjm = overrides.tjm ?? 'TJM 600€';
  const location = overrides.location ?? 'Paris';
  const duration = overrides.duration ?? '6 mois';
  const tags = overrides.tags ?? ['React', 'TypeScript'];

  return `
    <a href="/admin/freelance/mission/${uuid}">
      <h3 class="font-semibold">${title}</h3>
      <span class="text-sm font-medium text-gray-600">${company}</span>
      <span class="text-sm text-gray-500">${location}</span>
      <div>${tjm} - ${duration}</div>
      ${tags.map(t => `<span class="rounded-full bg-blue-100">${t}</span>`).join('')}
    </a>
  `;
}

function wrapHTML(cards: string): string {
  return `<html><body><div>${cards}</div></body></html>`;
}

describe('parseHiwayHTML', () => {
  it('parse une carte mission basique', () => {
    const html = wrapHTML(makeCard());
    const missions = parseHiwayHTML(html, NOW);
    expect(missions).toHaveLength(1);
    expect(missions[0]).toMatchObject({
      source: 'hiway',
      title: 'Dev React Senior',
      scrapedAt: NOW,
    });
  });

  it('extrait un ID stable depuis le UUID du href', () => {
    const html = wrapHTML(makeCard({ uuid: 'abc12345-e29b-41d4-a716-446655440000' }));
    const missions = parseHiwayHTML(html, NOW);
    expect(missions[0].id).toBe('hw-abc12345-e29b-41d4-a716-446655440000');
  });

  it('extrait le titre depuis h3.font-semibold', () => {
    const html = wrapHTML(makeCard({ title: 'Lead Java Spring' }));
    const missions = parseHiwayHTML(html, NOW);
    expect(missions[0].title).toBe('Lead Java Spring');
  });

  it('extrait le client depuis span.font-medium', () => {
    const html = wrapHTML(makeCard({ company: 'Tech SA' }));
    const missions = parseHiwayHTML(html, NOW);
    expect(missions[0].client).toBe('Tech SA');
  });

  it('extrait le TJM depuis le texte', () => {
    const html = wrapHTML(makeCard({ tjm: 'TJM 580€' }));
    const missions = parseHiwayHTML(html, NOW);
    expect(missions[0].tjm).toBe(580);
  });

  it('extrait les tags de stack', () => {
    const html = wrapHTML(makeCard({ tags: ['Vue', 'Node.js', 'PostgreSQL'] }));
    const missions = parseHiwayHTML(html, NOW);
    expect(missions[0].stack).toEqual(['Vue', 'Node.js', 'PostgreSQL']);
  });

  it('extrait la duree depuis le texte', () => {
    const html = wrapHTML(makeCard({ duration: '3 mois' }));
    const missions = parseHiwayHTML(html, NOW);
    expect(missions[0].duration).toBe('3 mois');
  });

  it('construit l URL complete', () => {
    const html = wrapHTML(makeCard({ uuid: '550e8400-e29b-41d4-a716-446655440000' }));
    const missions = parseHiwayHTML(html, NOW);
    expect(missions[0].url).toBe('https://hiway-missions.fr/admin/freelance/mission/550e8400-e29b-41d4-a716-446655440000');
  });

  it('parse plusieurs cartes', () => {
    const html = wrapHTML(
      makeCard({ uuid: '550e8400-e29b-41d4-a716-446655440000', title: 'Mission A' }) +
      makeCard({ uuid: '660e8400-e29b-41d4-a716-446655440001', title: 'Mission B' })
    );
    const missions = parseHiwayHTML(html, NOW);
    expect(missions).toHaveLength(2);
  });

  it('retourne un tableau vide pour du HTML vide', () => {
    expect(parseHiwayHTML('', NOW)).toEqual([]);
  });

  it('ignore les liens sans UUID valide', () => {
    const html = wrapHTML('<a href="/admin/freelance/mission/not-a-uuid"><h3 class="font-semibold">Test</h3></a>');
    const missions = parseHiwayHTML(html, NOW);
    expect(missions).toHaveLength(0);
  });

  it('ignore les cartes sans titre', () => {
    const html = wrapHTML('<a href="/admin/freelance/mission/550e8400-e29b-41d4-a716-446655440000"><div>No title here</div></a>');
    const missions = parseHiwayHTML(html, NOW);
    expect(missions).toHaveLength(0);
  });
});
