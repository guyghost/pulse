import type { RawExperience } from '../../core/profile-extractors/types';

export interface LinkedInExperienceDomOptions {
  stabilizationTimeoutMs: number;
  observationMs: number;
  stableCycles: number;
}

export type LinkedInExperienceDomSnapshot =
  | { kind: 'ready'; experiences: RawExperience[] }
  | { kind: 'empty'; experiences: [] }
  | { kind: 'blocked'; experiences: []; blockedReason: string }
  | { kind: 'timeout'; experiences: [] }
  | { kind: 'unreadable'; experiences: [] };

/**
 * Runs inside a LinkedIn detail tab through chrome.scripting.executeScript.
 * Keep every runtime dependency inside this function: Chrome serializes the
 * function body and does not retain module closure state.
 */
export async function extractLinkedInExperiencesFromDom(
  options: LinkedInExperienceDomOptions
): Promise<LinkedInExperienceDomSnapshot> {
  const cleanLine = (value: string | null | undefined): string =>
    (value ?? '').replace(/[\t\f\v \u00a0\u202f]+/g, ' ').trim();

  const isActionLine = (line: string): boolean =>
    /^(voir plus|show more|afficher plus|see more|modifier|edit|supprimer|delete)(?:\s|$)/i.test(
      line
    );
  const isDurationLine = (line: string): boolean =>
    /^\d+\s+(?:an|ans|mois|jour|jours|year|years|month|months|day|days)(?:\s+\d+\s+(?:mois|jours|months|days))?$/i.test(
      line
    );
  const isDateRangeLine = (line: string): boolean => {
    const range = cleanLine(line).match(/^(.+?)\s+[–—-]\s+(.+)$/);
    if (!range) {
      return false;
    }

    const [, start = '', end = ''] = range;
    const hasYear = (value: string): boolean => /\b(19|20)\d{2}\b/.test(value);
    const isCurrentRoleEnd = (value: string): boolean =>
      /(?:\b(?:present|current|currently|now|présent|en cours)\b|aujourd['’]hui)/i.test(value);
    return hasYear(start) && (hasYear(end) || isCurrentRoleEnd(end));
  };

  const visibleLines = (element: Element): string[] => {
    const visibleTextElements = [...element.querySelectorAll('[aria-hidden="true"]')].filter(
      (candidate) =>
        !candidate.closest('button, svg, [hidden], .visually-hidden, .sr-only') &&
        !candidate.querySelector('[aria-hidden="true"]')
    );
    const sources =
      visibleTextElements.length > 0
        ? visibleTextElements.map((candidate) => candidate.textContent ?? '')
        : (() => {
            const clone = element.cloneNode(true) as Element;
            for (const hidden of clone.querySelectorAll(
              'button, svg, [hidden], .visually-hidden, .sr-only, [aria-hidden="false"]'
            )) {
              hidden.remove();
            }
            const leafTextElements = [...clone.querySelectorAll('strong, span, p')].filter(
              (candidate) => !candidate.querySelector('strong, span, p')
            );
            return leafTextElements.length > 0
              ? leafTextElements.map((candidate) => candidate.textContent ?? '')
              : [clone.textContent ?? ''];
          })();

    const lines: string[] = [];
    const seen = new Set<string>();
    for (const source of sources) {
      for (const rawLine of source.split(/\r?\n/)) {
        const line = cleanLine(rawLine);
        const key = line.toLocaleLowerCase();
        if (!line || isActionLine(line) || isDurationLine(line) || seen.has(key)) {
          continue;
        }
        seen.add(key);
        lines.push(line);
      }
    }
    return lines;
  };

  const blockedReasonFromText = (value: string): string | null => {
    const text = value.toLocaleLowerCase();
    if (text.includes('security verification')) {
      return 'security verification required';
    }
    if (text.includes('unusual activity')) {
      return 'unusual activity challenge';
    }
    if (text.includes('verify your identity')) {
      return 'identity verification required';
    }
    if (text.includes('security check')) {
      return 'security check required';
    }
    if (text.includes('temporarily restricted')) {
      return 'temporarily restricted session';
    }
    return null;
  };

  const resolveRoot = (): Element | null => {
    const main = document.querySelector('main, [role="main"]');
    const experienceAnchor = document.querySelector('#experience');
    if (experienceAnchor && (!main || main.contains(experienceAnchor))) {
      return (
        experienceAnchor.closest('section') ?? experienceAnchor.parentElement ?? experienceAnchor
      );
    }

    const headings = document.querySelectorAll('h1, h2, h3, [role="heading"]');
    for (const heading of headings) {
      if (/^(experience|expérience)$/i.test(cleanLine(heading.textContent))) {
        return heading.closest('section') ?? heading.parentElement ?? main;
      }
    }

    if (/\/details\/experience\/?$/i.test(window.location.pathname)) {
      return main;
    }
    return null;
  };

  const strongPositionSelector = [
    '[data-entity-urn*="profilePosition"]',
    'a[href*="profilePosition="]',
    'a[href*="/details/experience/edit/forms/"]',
  ].join(', ');
  const rowDiscoverySelector = [
    strongPositionSelector,
    '[data-view-name="profile-component-entity"]',
    '.pvs-list__paged-list-item',
    'li.artdeco-list__item',
    '[role="listitem"]',
    'li',
  ].join(', ');

  interface CandidateRow {
    row: Element;
    strong: boolean;
    identity: string | undefined;
  }

  interface ResolvedLeaf extends CandidateRow {
    inheritedCompany: string | undefined;
  }

  const rowOwner = (candidate: Element, root: Element): Element => {
    const structuralOwner = candidate.closest('[role="listitem"], li, .pvs-list__paged-list-item');
    if (structuralOwner && root.contains(structuralOwner)) {
      return structuralOwner;
    }

    const semanticOwner = candidate.closest('[data-view-name="profile-component-entity"]');
    return semanticOwner && root.contains(semanticOwner) ? semanticOwner : candidate;
  };

  const positionIdentity = (marker: Element): string | undefined => {
    const normalize = (value: string): string | undefined => {
      try {
        const normalized = decodeURIComponent(value).trim().toLocaleLowerCase();
        return normalized || undefined;
      } catch {
        return undefined;
      }
    };

    const entityUrn = marker.getAttribute('data-entity-urn') ?? '';
    const urnIdentity = entityUrn.match(/profilePosition:(.+)$/i)?.[1];
    if (urnIdentity) {
      return normalize(urnIdentity);
    }

    const href = marker.getAttribute('href');
    if (!href) {
      return undefined;
    }
    try {
      const parsedHref = new URL(href, window.location.href);
      const ownerPositionId = parsedHref.pathname.match(
        /\/details\/experience\/edit\/forms\/([^/]+)\/?$/i
      )?.[1];
      if (ownerPositionId) {
        const normalizedOwnerPositionId = normalize(ownerPositionId);
        return normalizedOwnerPositionId
          ? `owner-position:${normalizedOwnerPositionId}`
          : undefined;
      }

      const hrefIdentity = parsedHref.searchParams.get('profilePosition');
      return hrefIdentity ? normalize(hrefIdentity) : undefined;
    } catch {
      return undefined;
    }
  };

  const hasPositionStructure = (row: Element): boolean => {
    const lines = visibleLines(row);
    const dateIndex = lines.findIndex(isDateRangeLine);
    return dateIndex >= 1;
  };

  const candidateRows = (root: Element): CandidateRow[] => {
    const discovered = new Map<Element, CandidateRow>();

    for (const marker of root.querySelectorAll(rowDiscoverySelector)) {
      const row = rowOwner(marker, root);
      let candidate = discovered.get(row);
      if (!candidate) {
        candidate = { row, strong: false, identity: undefined };
        discovered.set(row, candidate);
      }

      if (marker.matches(strongPositionSelector)) {
        candidate.strong = true;
        candidate.identity ??= positionIdentity(marker);
      }
    }

    const candidates = [...discovered.values()];
    const strongRows = candidates.filter((candidate) => candidate.strong);

    return candidates.filter((candidate) => {
      if (candidate.strong) {
        return true;
      }

      const containsStrongPosition = strongRows.some(
        (strongCandidate) =>
          strongCandidate.row !== candidate.row && candidate.row.contains(strongCandidate.row)
      );
      if (containsStrongPosition) {
        return true;
      }

      const belongsToStrongPosition = strongRows.some(
        (strongCandidate) =>
          strongCandidate.row !== candidate.row && strongCandidate.row.contains(candidate.row)
      );
      return !belongsToStrongPosition && hasPositionStructure(candidate.row);
    });
  };

  const leafRows = (root: Element, candidates: CandidateRow[]): ResolvedLeaf[] => {
    const candidateSet = new Set(candidates.map((candidate) => candidate.row));
    const topLevel = candidates.filter((candidate) => {
      for (
        let parent = candidate.row.parentElement;
        parent && parent !== root;
        parent = parent.parentElement
      ) {
        if (candidateSet.has(parent)) {
          return false;
        }
      }
      return true;
    });
    const leaves: ResolvedLeaf[] = [];

    for (const candidate of topLevel) {
      const descendants = candidates.filter(
        (other) => other.row !== candidate.row && candidate.row.contains(other.row)
      );
      if (descendants.length === 0) {
        leaves.push({ ...candidate, inheritedCompany: undefined });
        continue;
      }

      const groupClone = candidate.row.cloneNode(true) as Element;
      for (const nested of candidateRows(groupClone)) {
        nested.row.remove();
      }
      const groupCompany = visibleLines(groupClone).find((line) => !isDurationLine(line));
      for (const descendant of descendants) {
        const hasNestedCandidate = descendants.some(
          (other) =>
            other.row !== descendant.row &&
            descendant.row.contains(other.row) &&
            candidateSet.has(other.row)
        );
        if (!hasNestedCandidate) {
          leaves.push({ ...descendant, inheritedCompany: groupCompany });
        }
      }
    }

    return leaves;
  };

  const parseLeaf = (
    row: Element,
    inheritedCompany: string | undefined,
    positionIndex: number
  ): RawExperience | null => {
    const lines = visibleLines(row);
    const title = lines[0] ?? '';
    const dateIndex = lines.findIndex(isDateRangeLine);
    const rawDateRange = dateIndex >= 0 ? lines[dateIndex] : undefined;
    const structuralLineBeforeDate = dateIndex > 1 ? (lines[1] ?? '') : '';
    const [standaloneCompany = '', standaloneEmploymentType = ''] = structuralLineBeforeDate.split(
      /\s+[·•]\s+/,
      2
    );
    const company = inheritedCompany ? cleanLine(inheritedCompany) : cleanLine(standaloneCompany);
    const employmentType = inheritedCompany
      ? cleanLine(structuralLineBeforeDate)
      : cleanLine(standaloneEmploymentType);
    const dateRange = rawDateRange
      ? cleanLine(
          rawDateRange.replace(
            /\s+[·•]\s+\d+\s+(?:an|ans|mois|jour|jours|year|years|month|months|day|days)(?:\s+\d+\s+(?:mois|jours|months|days))?$/i,
            ''
          )
        )
      : undefined;
    const skillsLabelPattern = /^(?:compétences|skills)(?:\s*:\s*(.*))?$/i;
    const skillsIndex = lines.findIndex((line) => skillsLabelPattern.test(line));
    const skillsLine = skillsIndex >= 0 ? lines[skillsIndex] : '';
    const skillsValue = skillsLine.match(skillsLabelPattern)?.[1] ?? '';
    const skills = skillsValue
      ? skillsValue
          .split(/\s+[·•]\s+|\s*,\s*/)
          .map(cleanLine)
          .filter(Boolean)
      : [];
    const locationIndex =
      dateIndex >= 0
        ? lines.findIndex(
            (line, index) =>
              index > dateIndex &&
              index !== skillsIndex &&
              !isDurationLine(line) &&
              !isActionLine(line)
          )
        : -1;
    const location = locationIndex >= 0 ? lines[locationIndex] : undefined;
    const description = lines
      .filter(
        (_line, index) =>
          index !== 0 &&
          index !== 1 &&
          index !== dateIndex &&
          index !== locationIndex &&
          index !== skillsIndex
      )
      .join('\n');
    const entityUrn = cleanLine(row.getAttribute('data-entity-urn'));
    const hrefCandidates = [
      ...(row.matches('a[href]') ? [row] : []),
      ...row.querySelectorAll('a[href]'),
    ];
    const stableHref = hrefCandidates
      .map((anchor) => (anchor as HTMLAnchorElement).href)
      .find((href) => /\/details\/experience\//.test(href) || /profilePosition=/.test(href));
    const ownerPositionId = stableHref?.match(
      /\/details\/experience\/edit\/forms\/([^/?#]+)\/?(?:[?#].*)?$/i
    )?.[1];

    if (!title || !company || !dateRange) {
      return null;
    }
    return {
      title,
      company,
      ...(employmentType ? { employmentType } : {}),
      dateRange,
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      skills,
      externalId:
        entityUrn ||
        (ownerPositionId ? `linkedin-owner-position-${ownerPositionId}` : stableHref) ||
        `linkedin-experience-${positionIndex}`,
    };
  };

  const normalizeBusinessKeyText = (value: string | undefined): string =>
    cleanLine(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();

  const startMonthKey = (dateRange: string | undefined): string => {
    const start = normalizeBusinessKeyText(dateRange?.split(/\s+[–—-]\s+/, 1)[0]);
    const year = start.match(/\b(19|20)\d{2}\b/)?.[0] ?? '';
    if (!year) {
      return '';
    }

    const monthAliases: Record<string, string> = {
      jan: '01',
      janv: '01',
      january: '01',
      janvier: '01',
      feb: '02',
      febr: '02',
      february: '02',
      fev: '02',
      fevr: '02',
      fevrier: '02',
      mar: '03',
      mars: '03',
      march: '03',
      apr: '04',
      april: '04',
      avr: '04',
      avril: '04',
      may: '05',
      mai: '05',
      jun: '06',
      june: '06',
      juin: '06',
      jul: '07',
      july: '07',
      juil: '07',
      juillet: '07',
      aug: '08',
      august: '08',
      aou: '08',
      aout: '08',
      sep: '09',
      sept: '09',
      september: '09',
      septembre: '09',
      oct: '10',
      october: '10',
      octobre: '10',
      nov: '11',
      november: '11',
      novembre: '11',
      dec: '12',
      december: '12',
      decembre: '12',
    };
    const month = start
      .split(/[^a-z]+/)
      .map((token) => monthAliases[token])
      .find((value) => value !== undefined);
    return `${year}-${month ?? '01'}`;
  };

  const deduplicateExperiences = (experiences: RawExperience[]): RawExperience[] => {
    const seen = new Set<string>();
    return experiences.filter((experience) => {
      const key = [
        normalizeBusinessKeyText(experience.title),
        normalizeBusinessKeyText(experience.company),
        startMonthKey(experience.dateRange),
      ].join('|');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  const resolveExperiences = (
    root: Element,
    candidates: CandidateRow[]
  ): { experiences: RawExperience[]; hasInvalidStrongPosition: boolean } => {
    interface LeafBucket {
      leaves: ResolvedLeaf[];
      strong: boolean;
    }

    const buckets: LeafBucket[] = [];
    const bucketByIdentity = new Map<string, LeafBucket>();

    for (const leaf of leafRows(root, candidates)) {
      if (!leaf.identity) {
        buckets.push({ leaves: [leaf], strong: leaf.strong });
        continue;
      }

      let bucket = bucketByIdentity.get(leaf.identity);
      if (!bucket) {
        bucket = { leaves: [], strong: false };
        bucketByIdentity.set(leaf.identity, bucket);
        buckets.push(bucket);
      }
      bucket.leaves.push(leaf);
      bucket.strong ||= leaf.strong;
    }

    const experiences: RawExperience[] = [];
    let hasInvalidStrongPosition = false;
    for (const [index, bucket] of buckets.entries()) {
      const parsed = bucket.leaves
        .map((leaf) => parseLeaf(leaf.row, leaf.inheritedCompany, index))
        .find((experience): experience is RawExperience => experience !== null);
      if (parsed) {
        experiences.push(parsed);
      } else if (bucket.strong) {
        hasInvalidStrongPosition = true;
      }
    }

    return {
      experiences: deduplicateExperiences(experiences),
      hasInvalidStrongPosition,
    };
  };

  const snapshot = (kind: 'empty' | 'timeout' | 'unreadable'): LinkedInExperienceDomSnapshot => ({
    kind,
    experiences: [],
  });

  const timeoutMs = Math.max(0, options.stabilizationTimeoutMs);
  const observationMs = Math.max(0, options.observationMs);
  const stableCycles = Math.max(1, options.stableCycles);
  const deadline = Date.now() + timeoutMs;
  let sawRows = false;
  let sawExplicitEmptyState = false;
  let previousRowCount = -1;
  let previousHeight = -1;
  let unchangedCycles = 0;

  while (Date.now() <= deadline) {
    const root = resolveRoot();
    const rows = root ? candidateRows(root) : [];
    const resolved = root
      ? resolveExperiences(root, rows)
      : { experiences: [], hasInvalidStrongPosition: false };
    const hasParseableExperience = resolved.experiences.length > 0;
    const bodyText = cleanLine(document.body?.innerText || document.body?.textContent || '');
    const blockedReason = blockedReasonFromText(bodyText);
    if (blockedReason && !hasParseableExperience) {
      return { kind: 'blocked', experiences: [], blockedReason };
    }

    if (root) {
      const hasExplicitEmptyState = Boolean(
        root.querySelector(
          '.artdeco-empty-state, [data-test-empty-state], [data-testid="empty-state"]'
        )
      );
      sawRows ||= rows.length > 0;
      sawExplicitEmptyState ||= hasExplicitEmptyState;
      const documentElement = document.documentElement;
      const height = documentElement.scrollHeight;
      documentElement.scrollTop = height;
      const bottomReached = documentElement.scrollTop + documentElement.clientHeight >= height;
      const hasActiveLoader = [
        ...document.querySelectorAll(
          '[aria-busy="true"], [role="progressbar"], .artdeco-loader, .pvs-loader'
        ),
      ].some(
        (loader) => !loader.hasAttribute('hidden') && loader.getAttribute('aria-hidden') !== 'true'
      );

      if (hasActiveLoader) {
        unchangedCycles = 0;
      } else if (rows.length === previousRowCount && height === previousHeight) {
        unchangedCycles += 1;
      } else {
        unchangedCycles = 0;
      }
      previousRowCount = rows.length;
      previousHeight = height;

      if (bottomReached && !hasActiveLoader && unchangedCycles >= stableCycles) {
        if (rows.length === 0) {
          if (hasExplicitEmptyState) {
            return snapshot('empty');
          }
        } else {
          if (resolved.experiences.length === 0 || resolved.hasInvalidStrongPosition) {
            return snapshot('unreadable');
          }
          return {
            kind: 'ready',
            experiences: resolved.experiences,
          };
        }
      }
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, Math.min(observationMs, remainingMs));
    });
  }

  return snapshot(sawRows || sawExplicitEmptyState ? 'timeout' : 'unreadable');
}
