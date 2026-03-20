import type { Mission } from '../types/mission';
import { createMission, detectRemote, stripHtml } from './parser-utils';

/**
 * Hiway Supabase row shape for freelance_posted_missions table.
 * Based on the HTML parser's extraction fields and typical Supabase schema patterns.
 * Fields are nullable to handle variations in the actual API response.
 */
export interface HiwayMissionRow {
	id: string;
	title: string | null;
	client: string | null;
	company: string | null; // Alternative field name
	description: string | null;
	stack: string[] | null;
	skills: string[] | null; // Alternative field name
	tjm: number | null;
	daily_rate: number | null; // Alternative field name
	location: string | null;
	city: string | null; // Alternative field name
	remote: 'full' | 'hybrid' | 'onsite' | null;
	work_mode: string | null; // Alternative field name
	duration: string | null;
	duration_months: number | null; // Alternative numeric format
	url: string | null;
	slug: string | null; // For building URLs
	created_at: string | null;
	updated_at: string | null;
}

/**
 * Normalizes a HiwayMissionRow into a Mission object.
 * Pure function - no I/O, handles all field variations.
 */
export function parseHiwayMissionRow(row: HiwayMissionRow, now: Date, baseUrl: string): Mission | null {
	// Required field: id
	if (!row.id || typeof row.id !== 'string') {
		return null;
	}

	// Required field: title (with fallbacks)
	const title = row.title?.trim();
	if (!title) {
		return null;
	}

	// Build URL from slug or use provided URL
	let url: string;
	if (row.url) {
		url = row.url;
	} else if (row.slug) {
		url = `${baseUrl}/admin/freelance/mission/${row.slug}`;
	} else {
		url = `${baseUrl}/admin/freelance/mission/${row.id}`;
	}

	// Normalize client field
	const client = row.client ?? row.company ?? null;

	// Normalize stack/skills
	const rawStack = row.stack ?? row.skills ?? [];
	const stack = Array.isArray(rawStack)
		? rawStack.filter((s): s is string => typeof s === 'string' && s.length > 0)
		: [];

	// Normalize TJM
	const tjm = row.tjm ?? row.daily_rate ?? null;

	// Normalize location
	const location = row.location ?? row.city ?? null;

	// Normalize remote - handle both enum and string formats
	let remote: Mission['remote'] = null;
	if (row.remote && ['full', 'hybrid', 'onsite'].includes(row.remote)) {
		remote = row.remote;
	} else if (row.work_mode) {
		remote = detectRemote(row.work_mode);
	}

	// Normalize duration - handle both string and numeric formats
	let duration: string | null = row.duration ?? null;
	if (!duration && row.duration_months) {
		duration = `${row.duration_months} mois`;
	}

	// Normalize description
	const description = stripHtml(row.description ?? '');

	return createMission({
		id: `hw-${row.id}`,
		title,
		client,
		description,
		stack,
		tjm,
		location,
		remote,
		duration,
		url,
		source: 'hiway',
		scrapedAt: now,
	});
}

/**
 * Parses an array of Hiway Supabase rows into Mission objects.
 * Pure function - filters out invalid rows.
 */
export const parseHiwayJSON = (
	rows: unknown[],
	now: Date,
	baseUrl: string
): Mission[] => {
	if (!Array.isArray(rows)) {
		return [];
	}

	return rows
		.map((row) => {
			// Type guard: ensure row is an object
			if (typeof row !== 'object' || row === null) {
				return null;
			}
			return parseHiwayMissionRow(row as HiwayMissionRow, now, baseUrl);
		})
		.filter((m): m is Mission => m !== null);
};
