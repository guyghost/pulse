import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import { type Result, type AppError, ok, err, createConnectorError } from '$lib/core/errors';
import { createMission, stripHtml } from '$lib/core/connectors/parser-utils';
import { mapSkill, extractTjm, mapCollectiveRemote } from '$lib/core/connectors/collective-parser';
import {
  injectCookieRule,
  removeCookieRule,
  verifyCookieRule,
  getCookieCount,
  getCookieNames,
  type CookieRuleResult,
} from './cookie-rules';
import { detectBrowser } from '../../core/browser/browser-compat';

const API_URL = 'https://api.collective.work/graphql';
const APP_URL = 'https://app.collective.work';
const COOKIE_DOMAIN = '.collective.work';
const COOKIE_RULE_ID = 11;
const URL_FILTER = 'api.collective.work';

const GET_ME_QUERY = `
  query Collective_GetMe {
    me: Collective_GetMe {
      members {
        collective { slug }
      }
    }
  }
`;

const SEARCH_QUERY = `
  query Collective_SearchJobs($data: Collective_SearchJobsInputType!) {
    results: Collective_SearchJobs(data: $data) {
      projects {
        id
        slug
        name
        description
        sumUp
        budgetBrief
        duration
        idealStartDate
        workPreferences
        isPermanentContract
        projectTypes
        publishedAt
        company { name logoUrl }
        location { fullNameFrench }
      }
      pagination { from total }
    }
  }
`;

interface CollectiveProject {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sumUp: string | null;
  budgetBrief: string | null;
  duration: number | null;
  workPreferences: string[];
  isPermanentContract: boolean;
  projectTypes: string[];
  publishedAt: string | null;
  company: { name: string; logoUrl: string | null } | null;
  location: { fullNameFrench: string } | null;
}

export class CollectiveConnector extends BaseConnector {
  readonly id = 'collective';
  readonly name = 'Collective';
  readonly baseUrl = APP_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=collective.work&sz=32';

  private userSlug: string | null = null;

  protected get sessionCheckUrl() {
    return APP_URL;
  }

  async detectSession(_now: number): Promise<Result<boolean, AppError>> {
    try {
      const cookies = await chrome.cookies.getAll({ domain: COOKIE_DOMAIN });
      console.debug('[collective] detectSession: found', cookies.length, 'cookies');
      const hasSession =
        cookies.length > 0 &&
        cookies.some(
          (c) =>
            c.name.includes('session') ||
            c.name.includes('token') ||
            c.name.includes('auth') ||
            c.name.includes('connect') ||
            c.name === '__Secure-next-auth.session-token'
        );

      if (!hasSession) {
        // FALLBACK: Try cookie injection + API query for browsers with partitioned cookies
        console.debug(
          '[collective] detectSession: no session cookies found, trying fallback detection via cookie injection'
        );
        const injectResult = await injectCookieRule(COOKIE_DOMAIN, URL_FILTER, COOKIE_RULE_ID);
        if (injectResult.success) {
          try {
            const resp = await fetch(API_URL, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: GET_ME_QUERY }),
            });
            if (resp.ok) {
              const data = (await resp.json()) as {
                data?: { me?: { members?: { collective?: { slug?: string } }[] } };
              };
              if (data.data?.me?.members && data.data.me.members.length > 0) {
                console.debug(
                  '[collective] detectSession: fallback detection succeeded, user slug:',
                  data.data.me.members[0]?.collective?.slug
                );
                this.userSlug = data.data.me.members[0]?.collective?.slug ?? null;
                return ok(true);
              }
            }
          } catch (fallbackError) {
            if (import.meta.env.DEV) {
              console.warn('[collective] detectSession: fallback detection failed:', fallbackError);
            }
          }
        }
        console.debug(
          '[collective] detectSession: fallback detection failed - no cookies or API error'
        );
        return ok(false);
      }

      // Inject cookie rule once — reused by fetchMissions
      await injectCookieRule(COOKIE_DOMAIN, URL_FILTER, COOKIE_RULE_ID);

      // Discover user slug for mission URLs
      try {
        const resp = await fetch(API_URL, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: GET_ME_QUERY }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as {
            data?: { me?: { members?: { collective?: { slug?: string } }[] } };
          };
          this.userSlug = data.data?.me?.members?.[0]?.collective?.slug ?? null;
        }
      } catch {
        // Non-blocking — URLs will use fallback
      }

      return ok(true);
    } catch {
      return ok(false);
    }
  }

  async fetchMissions(
    now: number,
    context?: ConnectorSearchContext
  ): Promise<Result<Mission[], AppError>> {
    try {
      // Verify cookie rule is active, re-inject if needed
      const ruleActive = await verifyCookieRule(COOKIE_RULE_ID);
      if (!ruleActive) {
        console.debug('[collective] fetchMissions: cookie rule not active, re-injecting');
        await injectCookieRule(COOKIE_DOMAIN, URL_FILTER, COOKIE_RULE_ID);
      }

      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: SEARCH_QUERY,
          variables: {
            data: {
              query: context?.query ?? '',
              dailyRates: { from: 0, to: null },
              locations: context?.location ? [context.location] : [],
              skills: context?.skills ?? [],
              workPreferences:
                context?.remote && context.remote !== 'any'
                  ? [
                      context.remote === 'full'
                        ? 'fullRemote'
                        : context.remote === 'hybrid'
                          ? 'hybrid'
                          : 'onsite',
                    ]
                  : [],
              exclusive: false,
              hasDailyRate: false,
              companies: [],
              fromTopRecruiter: false,
              idealStartDate: [],
              contractType: 'All',
              offerLanguages: [],
              from: 0,
              sort: 'PublishedAt',
              explain: false,
            },
          },
        }),
      });

      if (!response.ok) {
        await removeCookieRule(COOKIE_RULE_ID);
        return err(
          createConnectorError(
            `Collective API error: ${response.status}`,
            {
              connectorId: this.id,
              phase: 'fetch',
              context: {
                status: response.status,
                browser: detectBrowser(typeof navigator !== 'undefined' ? navigator.userAgent : '')
                  .name,
              },
            },
            now
          )
        );
      }

      const result = (await response.json()) as {
        data?: {
          results?: {
            projects?: CollectiveProject[];
            pagination?: { total: number };
          };
        };
      };

      const projects = result.data?.results?.projects ?? [];
      const missions = projects.map((p) =>
        createMission({
          id: `col-${p.id}`,
          title: p.name,
          client: p.company?.name ?? null,
          description: stripHtml(p.sumUp ?? p.description ?? ''),
          stack: p.projectTypes.map(mapSkill),
          tjm: extractTjm(p.budgetBrief),
          location: p.location?.fullNameFrench ?? null,
          remote: mapCollectiveRemote(p.workPreferences),
          duration: p.duration ? `${p.duration} mois` : null,
          url: this.userSlug
            ? `${APP_URL}/collective/${this.userSlug}/jobs?jobId=${p.id}`
            : `${APP_URL}/job/${p.slug}`,
          source: 'collective' as const,
          scrapedAt: new Date(now),
        })
      );

      await removeCookieRule(COOKIE_RULE_ID);
      return ok(missions);
    } catch (e) {
      await removeCookieRule(COOKIE_RULE_ID);
      const message = e instanceof Error ? e.message : String(e);
      return err(
        createConnectorError(
          `Unexpected error fetching missions from Collective: ${message}`,
          { connectorId: this.id, phase: 'fetch', context: { originalError: message } },
          now
        )
      );
    }
  }
}
