import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import { type Result, type AppError, ok, err, createConnectorError } from '$lib/core/errors';
import { createMission, stripHtml } from '$lib/core/connectors/parser-utils';
import { injectCookieRule, removeCookieRule } from './cookie-rules';

const API_BASE = 'https://api.lehibou.com/api';
const MISSIONS_URL = `${API_BASE}/search/mission/list`;
const COOKIE_DOMAIN = '.lehibou.com';
const COOKIE_RULE_ID = 10;
const URL_FILTER = 'api.lehibou.com';
const ITEMS_PER_PAGE = 50;
const MAX_PAGES = 5;

interface LeHibouMission {
  id: string;
  title: string;
  description: string;
  city: { title: string; country?: { title: string } } | null;
  remote: boolean | string | null;
  duration: number | null;
  durationUnit: string | null;
  skills: { title: string }[] | null;
  tjm: number | null;
  createdAt: string;
}

function mapRemote(remote: unknown): Mission['remote'] {
  if (remote === true) {
    return 'full';
  }
  if (remote === false) {
    return 'onsite';
  }
  if (typeof remote === 'string') {
    const r = remote.toLowerCase();
    if (r.includes('full') || r.includes('remote')) {
      return 'full';
    }
    if (r.includes('hybrid') || r.includes('partiel')) {
      return 'hybrid';
    }
    if (r.includes('onsite') || r.includes('présentiel')) {
      return 'onsite';
    }
  }
  return null;
}

function formatDuration(duration: number | null, unit: string | null): string | null {
  if (!duration) {
    return null;
  }
  const u = unit?.toLowerCase() ?? 'mois';
  if (u.includes('day') || u.includes('jour')) {
    return `${duration} jour${duration > 1 ? 's' : ''}`;
  }
  if (u.includes('week') || u.includes('semaine')) {
    return `${duration} semaine${duration > 1 ? 's' : ''}`;
  }
  if (u.includes('year') || u.includes('an')) {
    return `${duration} an${duration > 1 ? 's' : ''}`;
  }
  return `${duration} mois`;
}

export class LeHibouConnector extends BaseConnector {
  readonly id = 'lehibou';
  readonly name = 'LeHibou';
  readonly baseUrl = 'https://www.lehibou.com';
  readonly icon = 'https://www.google.com/s2/favicons?domain=lehibou.com&sz=32';

  protected get sessionCheckUrl() {
    return `${API_BASE}/freelancers/me`;
  }

  async detectSession(_now: number): Promise<Result<boolean, AppError>> {
    try {
      const cookies = await chrome.cookies.getAll({ domain: COOKIE_DOMAIN });
      return ok(cookies.some((c) => c.name === 'rt'));
    } catch {
      return ok(false);
    }
  }

  async fetchMissions(
    now: number,
    context?: ConnectorSearchContext
  ): Promise<Result<Mission[], AppError>> {
    try {
      await injectCookieRule(COOKIE_DOMAIN, URL_FILTER, COOKIE_RULE_ID);
      const allMissions: Mission[] = [];

      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${MISSIONS_URL}?limit=${ITEMS_PER_PAGE}&page=${page}`;

        // Build search body with context
        const body: Record<string, unknown> = {};
        if (context?.query) {
          body.query = context.query;
        }
        if (context?.skills?.length) {
          body.skills = context.skills;
        }

        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          await removeCookieRule(COOKIE_RULE_ID);
          return err(
            createConnectorError(
              `LeHibou API error: ${response.status}`,
              { connectorId: this.id, phase: 'fetch', context: { page, status: response.status } },
              now
            )
          );
        }

        const data = (await response.json()) as { total: number; missions: LeHibouMission[] };
        if (!data.missions || data.missions.length === 0) {
          break;
        }

        for (const m of data.missions) {
          allMissions.push(
            createMission({
              id: `lh-${m.id}`,
              title: m.title,
              client: null,
              description: stripHtml(m.description ?? ''),
              stack: (m.skills ?? []).map((s) => s.title),
              tjm: m.tjm,
              location: m.city
                ? `${m.city.title}${m.city.country ? `, ${m.city.country.title}` : ''}`
                : null,
              remote: mapRemote(m.remote),
              duration: formatDuration(m.duration, m.durationUnit),
              url: `https://www.lehibou.com/annonce/${m.id}`,
              source: 'lehibou' as const,
              scrapedAt: new Date(now),
            })
          );
        }

        if (allMissions.length >= data.total) {
          break;
        }
      }

      await removeCookieRule(COOKIE_RULE_ID);
      return ok(allMissions);
    } catch (e) {
      await removeCookieRule(COOKIE_RULE_ID);
      const message = e instanceof Error ? e.message : String(e);
      return err(
        createConnectorError(
          `Unexpected error fetching missions from LeHibou: ${message}`,
          { connectorId: this.id, phase: 'fetch', context: { originalError: message } },
          now
        )
      );
    }
  }
}
