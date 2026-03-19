import { describe, it, expect } from 'vitest';
import { parseHiwayJSON, parseHiwayMissionRow, type HiwayMissionRow } from '../../../src/lib/core/connectors/hiway-json-parser';
import { getConnectorIds, getConnectorsMeta, getConnector } from '../../../src/lib/shell/connectors/index';

const NOW = new Date('2026-03-15T12:00:00Z');
const BASE_URL = 'https://hiway-missions.fr';

function makeRow(overrides: Partial<HiwayMissionRow> = {}): HiwayMissionRow {
	return {
		id: '550e8400-e29b-41d4-a716-446655440000',
		title: 'Dev React Senior',
		client: 'Acme Corp',
		company: null,
		description: 'Mission de développement React',
		stack: ['React', 'TypeScript'],
		skills: null,
		tjm: 600,
		daily_rate: null,
		location: 'Paris',
		city: null,
		remote: 'full',
		work_mode: null,
		duration: '6 mois',
		duration_months: null,
		url: null,
		slug: null,
		created_at: '2026-03-15T10:00:00Z',
		updated_at: null,
		...overrides,
	};
}

describe('parseHiwayMissionRow', () => {
	it('parses a complete mission row', () => {
		const row = makeRow();
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		
		expect(mission).not.toBeNull();
		expect(mission).toMatchObject({
			id: 'hw-550e8400-e29b-41d4-a716-446655440000',
			title: 'Dev React Senior',
			client: 'Acme Corp',
			description: 'Mission de développement React',
			stack: ['React', 'TypeScript'],
			tjm: 600,
			location: 'Paris',
			remote: 'full',
			duration: '6 mois',
			source: 'hiway',
			scrapedAt: NOW,
		});
	});

	it('extracts ID stable from row.id', () => {
		const row = makeRow({ id: 'abc12345-e29b-41d4-a716-446655440000' });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission?.id).toBe('hw-abc12345-e29b-41d4-a716-446655440000');
	});

	it('uses company field as fallback for client', () => {
		const row = makeRow({ client: null, company: 'Tech SA' });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission?.client).toBe('Tech SA');
	});

	it('uses skills field as fallback for stack', () => {
		const row = makeRow({ stack: null, skills: ['Vue', 'Node.js'] });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission?.stack).toEqual(['Vue', 'Node.js']);
	});

	it('uses daily_rate field as fallback for tjm', () => {
		const row = makeRow({ tjm: null, daily_rate: 580 });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission?.tjm).toBe(580);
	});

	it('uses city field as fallback for location', () => {
		const row = makeRow({ location: null, city: 'Lyon' });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission?.location).toBe('Lyon');
	});

	it('uses work_mode string to detect remote', () => {
		const row = makeRow({ remote: null, work_mode: 'Full remote possible' });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission?.remote).toBe('full');
	});

	it('converts duration_months to duration string', () => {
		const row = makeRow({ duration: null, duration_months: 3 });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission?.duration).toBe('3 mois');
	});

	it('builds URL from slug when url is null', () => {
		const row = makeRow({ url: null, slug: 'mission-react-123' });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission?.url).toBe('https://hiway-missions.fr/admin/freelance/mission/mission-react-123');
	});

	it('builds URL from id when both url and slug are null', () => {
		const row = makeRow({ url: null, slug: null });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission?.url).toBe('https://hiway-missions.fr/admin/freelance/mission/550e8400-e29b-41d4-a716-446655440000');
	});

	it('uses provided url when present', () => {
		const row = makeRow({ url: 'https://custom.url/mission/123' });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission?.url).toBe('https://custom.url/mission/123');
	});

	it('returns null for row without id', () => {
		const row = makeRow({ id: '' });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission).toBeNull();
	});

	it('returns null for row without title', () => {
		const row = makeRow({ title: null });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission).toBeNull();
	});

	it('returns null for row with empty title', () => {
		const row = makeRow({ title: '   ' });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission).toBeNull();
	});

	it('strips HTML from description', () => {
		const row = makeRow({ description: '<p>Hello <b>World</b></p>' });
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		expect(mission?.description).toBe('Hello World');
	});

	it('handles null fields gracefully', () => {
		const row = makeRow({
			client: null,
			company: null,
			description: null,
			stack: null,
			tjm: null,
			location: null,
			remote: null,
			duration: null,
		});
		const mission = parseHiwayMissionRow(row, NOW, BASE_URL);
		
		expect(mission).not.toBeNull();
		expect(mission?.client).toBeNull();
		expect(mission?.description).toBe('');
		expect(mission?.stack).toEqual([]);
		expect(mission?.tjm).toBeNull();
		expect(mission?.location).toBeNull();
		expect(mission?.remote).toBeNull();
		expect(mission?.duration).toBeNull();
	});
});

describe('parseHiwayJSON', () => {
	it('parses an array of rows', () => {
		const rows = [
			makeRow({ id: 'id-1', title: 'Mission A' }),
			makeRow({ id: 'id-2', title: 'Mission B' }),
		];
		const missions = parseHiwayJSON(rows, NOW, BASE_URL);
		
		expect(missions).toHaveLength(2);
		expect(missions[0].title).toBe('Mission A');
		expect(missions[1].title).toBe('Mission B');
	});

	it('filters out invalid rows', () => {
		const rows = [
			makeRow({ id: 'id-1', title: 'Mission A' }),
			{ id: '' }, // No title
			null, // Null row
			'string', // Not an object
			makeRow({ id: 'id-2', title: 'Mission B' }),
		];
		const missions = parseHiwayJSON(rows as unknown[], NOW, BASE_URL);
		
		expect(missions).toHaveLength(2);
	});

	it('returns empty array for non-array input', () => {
		expect(parseHiwayJSON(null as unknown, NOW, BASE_URL)).toEqual([]);
		expect(parseHiwayJSON({} as unknown, NOW, BASE_URL)).toEqual([]);
		expect(parseHiwayJSON('string' as unknown, NOW, BASE_URL)).toEqual([]);
	});

	it('returns empty array for empty input', () => {
		expect(parseHiwayJSON([], NOW, BASE_URL)).toEqual([]);
	});
});

// ============================================================================
// Enabled State Tests
// Hiway connector is enabled with confirmed Supabase credentials.
// ============================================================================

describe('Hiway connector enabled state', () => {
	it('is in the active connector registry', () => {
		const activeIds = getConnectorIds();
		expect(activeIds).toContain('hiway');
		expect(activeIds).toEqual(['free-work', 'lehibou', 'hiway', 'collective', 'cherry-pick']);
	});

	it('is in the connectors metadata for UI display', () => {
		const meta = getConnectorsMeta();
		const hiwayMeta = meta.find((m) => (m.id as string) === 'hiway');
		expect(hiwayMeta).toBeDefined();
		expect(hiwayMeta).toMatchObject({
			id: 'hiway',
			name: 'Hiway',
			url: 'https://hiway-missions.fr',
		});
	});

	it('JSON parser is available for Supabase row parsing', () => {
		expect(typeof parseHiwayJSON).toBe('function');
		expect(typeof parseHiwayMissionRow).toBe('function');
	});

	it('connector can be instantiated via registry', async () => {
		const connector = await getConnector('hiway');
		expect(connector).not.toBeNull();
		expect(connector?.id).toBe('hiway');
		expect(connector?.name).toBe('Hiway');
		expect(connector?.baseUrl).toBe('https://hiway-missions.fr');
	});
});
