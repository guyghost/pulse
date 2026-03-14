# LeHibou Connector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the generic LeHibou connector with a dedicated one that correctly scrapes mission cards from lehibou.com.

**Architecture:** FC&IS — pure parser function in Core (`lehibou-parser.ts`), connector class in Shell (`lehibou.connector.ts`). The parser extracts structured `Mission[]` from raw HTML using LeHibou-specific CSS selectors. The connector fetches pages 1-5 sequentially and concatenates results.

**Tech Stack:** TypeScript, DOMParser, Vitest, Svelte 5 extension (Chrome MV3)

---

### Task 1: Write LeHibou parser tests

**Files:**
- Create: `tests/unit/connectors/lehibou.test.ts`

**Step 1: Write the test file with HTML fixture and test cases**

```typescript
import { describe, it, expect } from 'vitest';
import { parseLeHibouHTML } from '../../../src/lib/core/connectors/lehibou-parser';

const NOW = new Date('2026-03-13T12:00:00Z');
const ID_PREFIX = 'lh-test';

const FIXTURE_HTML = `
<html><body>
<a class="mission-card" href="/annonce/aaa-bbb-ccc?source=search-engine">
  <span class="mission-card__publishedDate">Publiee il y a 6 heures</span>
  <header class="mission-card__header">
    <h1 class="mission-card__header__title">Expert Splunk H/F</h1>
    <span class="atom-badge"><span>Mission LeHibou</span></span>
  </header>
  <section class="mission-card__informations">
    <div class="mission-card__informations__item"><span></span><span>Paris</span></div>
    <div class="mission-card__informations__item"><span></span><span>24 mois</span></div>
    <div class="mission-card__informations__item"><span></span><span>ASAP</span></div>
  </section>
  <section class="mission-card__skills">
    <div class="tag"><span class="mission-card__skills--title">Splunk</span></div>
    <div class="tag"><span class="mission-card__skills--title">Qualys</span></div>
  </section>
  <footer class="mission-card__footer">
    <div class="mission-card__footer__dailyPrice">550 &euro;/jour</div>
    <span class="mission-card__publishedDate">Publiee il y a 6 heures</span>
  </footer>
</a>
<a class="mission-card" href="/annonce/ddd-eee-fff?source=search-engine">
  <header class="mission-card__header">
    <h1 class="mission-card__header__title">Dev Java Backend</h1>
    <span class="atom-badge"><span>Mission externe</span></span>
  </header>
  <section class="mission-card__informations">
    <div class="mission-card__informations__item"><span></span><span>Lyon</span></div>
    <div class="mission-card__informations__item"><span></span><span>6 mois</span></div>
    <div class="mission-card__informations__item"><span></span><span>ASAP</span></div>
  </section>
  <section class="mission-card__skills">
    <div class="tag"><span class="mission-card__skills--title">Java</span></div>
    <div class="tag"><span class="mission-card__skills--title">Spring Boot</span></div>
  </section>
  <footer class="mission-card__footer">
    <div class="mission-card__footer__dailyPrice">650 &euro;/jour</div>
  </footer>
</a>
</body></html>
`;

describe('parseLeHibouHTML', () => {
  it('parse les cartes de mission depuis le HTML', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions).toHaveLength(2);
    expect(missions[0]).toMatchObject({
      source: 'lehibou',
      title: 'Expert Splunk H/F',
      id: 'lh-aaa-bbb-ccc',
      url: 'https://www.lehibou.com/annonce/aaa-bbb-ccc',
      scrapedAt: NOW,
    });
  });

  it('extrait l\'UUID du href comme ID', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].id).toBe('lh-aaa-bbb-ccc');
    expect(missions[1].id).toBe('lh-ddd-eee-fff');
  });

  it('construit l\'URL sans le query param source', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].url).toBe('https://www.lehibou.com/annonce/aaa-bbb-ccc');
    expect(missions[1].url).not.toContain('source=');
  });

  it('extrait les tags de stack', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].stack).toEqual(['Splunk', 'Qualys']);
    expect(missions[1].stack).toEqual(['Java', 'Spring Boot']);
  });

  it('extrait le TJM comme nombre', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].tjm).toBe(550);
    expect(missions[1].tjm).toBe(650);
  });

  it('extrait la localisation depuis le premier item info', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].location).toBe('Paris');
    expect(missions[1].location).toBe('Lyon');
  });

  it('extrait la duree depuis le deuxieme item info', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].duration).toBe('24 mois');
    expect(missions[1].duration).toBe('6 mois');
  });

  it('met client, remote et description a null/vide', () => {
    const missions = parseLeHibouHTML(FIXTURE_HTML, NOW, ID_PREFIX);
    expect(missions[0].client).toBeNull();
    expect(missions[0].remote).toBeNull();
    expect(missions[0].description).toBe('');
  });

  it('retourne un tableau vide pour du HTML vide', () => {
    expect(parseLeHibouHTML('', NOW, ID_PREFIX)).toEqual([]);
  });

  it('retourne un tableau vide pour du HTML sans cartes', () => {
    expect(parseLeHibouHTML('<html><body><p>Aucune annonce</p></body></html>', NOW, ID_PREFIX)).toEqual([]);
  });

  it('ignore les cartes sans titre', () => {
    const html = `<a class="mission-card" href="/annonce/xxx">
      <header class="mission-card__header"><h1 class="mission-card__header__title"></h1></header>
    </a>`;
    expect(parseLeHibouHTML(html, NOW, ID_PREFIX)).toEqual([]);
  });

  it('gere un TJM absent gracieusement', () => {
    const html = `<a class="mission-card" href="/annonce/zzz">
      <header class="mission-card__header"><h1 class="mission-card__header__title">Mission sans TJM</h1></header>
      <section class="mission-card__informations"></section>
      <section class="mission-card__skills"></section>
      <footer class="mission-card__footer"></footer>
    </a>`;
    const missions = parseLeHibouHTML(html, NOW, ID_PREFIX);
    expect(missions[0].tjm).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/unit/connectors/lehibou.test.ts`
Expected: FAIL — the current `parseLeHibouHTML` delegates to `parseGenericHTML` which won't match these selectors and the ID/URL logic differs.

---

### Task 2: Implement the LeHibou parser

**Files:**
- Modify: `src/lib/core/connectors/lehibou-parser.ts`

**Step 1: Replace the parser with dedicated implementation**

```typescript
import type { Mission } from '../types/mission';

const SOURCE = 'lehibou' as const;
const BASE_URL = 'https://www.lehibou.com';

export function parseLeHibouHTML(html: string, now: Date, _idPrefix: string): Mission[] {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const missions: Mission[] = [];

  const cards = doc.querySelectorAll('a.mission-card');

  cards.forEach((card) => {
    const title = card.querySelector('.mission-card__header__title')?.textContent?.trim() ?? '';
    if (!title) return;

    const href = card.getAttribute('href') ?? '';
    const uuidMatch = href.match(/\/annonce\/([a-f0-9-]+)/);
    const uuid = uuidMatch?.[1] ?? '';
    const id = uuid ? `lh-${uuid}` : `lh-${now.getTime()}`;
    const url = uuid ? `${BASE_URL}/annonce/${uuid}` : `${BASE_URL}${href}`;

    const infoItems = card.querySelectorAll('.mission-card__informations__item');
    const location = infoItems[0]?.textContent?.trim() || null;
    const duration = infoItems[1]?.textContent?.trim() || null;

    const skillEls = card.querySelectorAll('.mission-card__skills--title');
    const stack = Array.from(skillEls).map(el => el.textContent?.trim() ?? '').filter(Boolean);

    const tjmText = card.querySelector('.mission-card__footer__dailyPrice')?.textContent?.trim() ?? '';
    const tjmNormalized = tjmText.replace(/[\s\u00A0]/g, '');
    const tjmMatch = tjmNormalized.match(/(\d+)/);
    const tjm = tjmMatch ? parseInt(tjmMatch[1], 10) : null;

    missions.push({
      id,
      title,
      client: null,
      description: '',
      stack,
      tjm,
      location,
      remote: null,
      duration,
      url,
      source: SOURCE,
      scrapedAt: now,
      score: null,
      semanticScore: null,
      semanticReason: null,
    });
  });

  return missions;
}
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/connectors/lehibou.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add tests/unit/connectors/lehibou.test.ts src/lib/core/connectors/lehibou-parser.ts
git commit -m "feat(lehibou): add dedicated parser with real CSS selectors

Replace generic parser delegation with LeHibou-specific implementation.
Extracts UUID-based IDs, location, duration, skills, and TJM from
the actual mission-card DOM structure on lehibou.com."
```

---

### Task 3: Replace the shell connector

**Files:**
- Modify: `src/lib/shell/connectors/lehibou.connector.ts`
- Modify: `src/lib/shell/connectors/index.ts`

**Step 1: Rewrite the connector as a dedicated class**

`src/lib/shell/connectors/lehibou.connector.ts`:

```typescript
import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseLeHibouHTML } from '../../core/connectors/lehibou-parser';

const BASE_URL = 'https://www.lehibou.com';
const ANNONCES_URL = `${BASE_URL}/recherche/annonces`;
const MAX_PAGES = 5;

export class LeHibouConnector extends BaseConnector {
  readonly id = 'lehibou';
  readonly name = 'LeHibou';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=lehibou.com&sz=32';

  protected get sessionCheckUrl() { return ANNONCES_URL; }

  async fetchMissions(): Promise<Mission[]> {
    const allMissions: Mission[] = [];
    const now = new Date();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = page === 1 ? ANNONCES_URL : `${ANNONCES_URL}?page=${page}`;
      const html = await this.fetchHTML(url);
      const missions = parseLeHibouHTML(html, now, `lh-${now.getTime()}`);
      if (missions.length === 0) break;
      allMissions.push(...missions);
    }

    await this.setLastSync();
    return allMissions;
  }
}
```

**Step 2: Update the connector registry**

In `src/lib/shell/connectors/index.ts`, the import already uses `LeHibouConnector` and the registry already has `LeHibouConnector`. Change from the generic factory instance to `new LeHibouConnector()`:

```typescript
// Change the import:
import { LeHibouConnector } from './lehibou.connector';

// Change the registry entry from:
//   LeHibouConnector,
// to:
//   new LeHibouConnector(),
```

**Step 3: Run all tests to verify no regressions**

Run: `pnpm test`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/lib/shell/connectors/lehibou.connector.ts src/lib/shell/connectors/index.ts
git commit -m "feat(lehibou): dedicated connector with multi-page fetching

Replace GenericConnector factory with dedicated LeHibouConnector class.
Fetches pages 1-5 sequentially with early exit on empty results.
Session detection via /recherche/annonces redirect check."
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Write parser tests | `tests/unit/connectors/lehibou.test.ts` |
| 2 | Implement parser + make tests pass | `src/lib/core/connectors/lehibou-parser.ts` |
| 3 | Replace shell connector + update registry | `lehibou.connector.ts`, `index.ts` |
