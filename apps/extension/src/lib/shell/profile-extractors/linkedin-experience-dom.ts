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
    (value ?? '').replace(/[\t\f\v ]+/g, ' ').trim();

  const isActionLine = (line: string): boolean =>
    /^(voir plus|show more|afficher plus|see more|modifier|edit|supprimer|delete)(?:\s|$)/i.test(
      line
    );
  const isDurationLine = (line: string): boolean =>
    /^\d+\s+(?:an|ans|mois|jour|jours|year|years|month|months|day|days)(?:\s+\d+\s+(?:mois|jours|months|days))?$/i.test(
      line
    );

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

  const candidateRows = (root: Element): Element[] => {
    const preferred = [...root.querySelectorAll('.pvs-list__paged-list-item')];
    if (preferred.length > 0) {
      return preferred;
    }
    return [...root.querySelectorAll('li.artdeco-list__item')];
  };

  const leafRows = (
    root: Element
  ): Array<{ row: Element; inheritedCompany: string | undefined }> => {
    const candidates = candidateRows(root);
    const candidateSet = new Set(candidates);
    const topLevel = candidates.filter((row) => {
      for (
        let parent = row.parentElement;
        parent && parent !== root;
        parent = parent.parentElement
      ) {
        if (candidateSet.has(parent)) {
          return false;
        }
      }
      return true;
    });
    const leaves: Array<{ row: Element; inheritedCompany: string | undefined }> = [];

    for (const row of topLevel) {
      const descendants = candidates.filter(
        (candidate) => candidate !== row && row.contains(candidate)
      );
      if (descendants.length === 0) {
        leaves.push({ row, inheritedCompany: undefined });
        continue;
      }

      const groupClone = row.cloneNode(true) as Element;
      for (const nested of groupClone.querySelectorAll(
        '.pvs-list__paged-list-item, li.artdeco-list__item'
      )) {
        nested.remove();
      }
      const groupCompany = visibleLines(groupClone).find((line) => !isDurationLine(line));
      const descendantSet = new Set(descendants);
      for (const descendant of descendants) {
        const hasNestedCandidate = descendants.some(
          (other) => other !== descendant && descendant.contains(other) && descendantSet.has(other)
        );
        if (!hasNestedCandidate) {
          leaves.push({ row: descendant, inheritedCompany: groupCompany });
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
    const dateIndex = lines.findIndex(
      (line) => /\b(19|20)\d{2}\b/.test(line) && /[–—-]/.test(line)
    );
    const rawCompanyLine = lines[1] ?? '';
    const companyLine = inheritedCompany
      ? /\s+[·•]\s+/.test(rawCompanyLine)
        ? rawCompanyLine
        : `${inheritedCompany}${rawCompanyLine ? ` · ${rawCompanyLine}` : ''}`
      : rawCompanyLine;
    const [companyPart = '', employmentPart = ''] = companyLine.split(/\s+[·•]\s+/, 2);
    const rawDateRange = lines.find((line) => /\b(19|20)\d{2}\b/.test(line) && /[–—-]/.test(line));
    const dateRange = rawDateRange
      ? cleanLine(
          rawDateRange.replace(
            /\s+[·•]\s+\d+\s+(?:an|ans|mois|jour|jours|year|years|month|months|day|days)(?:\s+\d+\s+(?:mois|jours|months|days))?$/i,
            ''
          )
        )
      : undefined;
    const skillsIndex = lines.findIndex((line) => /^(compétences|skills)\s*:?/i.test(line));
    const skillsLine = skillsIndex >= 0 ? lines[skillsIndex] : '';
    const skillsValue = skillsLine.replace(/^(compétences|skills)\s*:?\s*/i, '');
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
    const stableHref = [...row.querySelectorAll('a[href]')]
      .map((anchor) => (anchor as HTMLAnchorElement).href)
      .find((href) => /\/details\/experience\//.test(href) || /profilePosition=/.test(href));

    if (!title || !cleanLine(companyPart) || !dateRange) {
      return null;
    }
    return {
      title,
      company: cleanLine(companyPart),
      ...(cleanLine(employmentPart) ? { employmentType: cleanLine(employmentPart) } : {}),
      dateRange,
      ...(location ? { location } : {}),
      ...(description ? { description } : {}),
      skills,
      externalId: entityUrn || stableHref || `linkedin-experience-${positionIndex}`,
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
  let sawRecognizedList = false;
  let previousRowCount = -1;
  let previousHeight = -1;
  let unchangedCycles = 0;

  while (Date.now() <= deadline) {
    const bodyText = cleanLine(document.body?.innerText || document.body?.textContent || '');
    const blockedReason = blockedReasonFromText(bodyText);
    if (blockedReason) {
      return { kind: 'blocked', experiences: [], blockedReason };
    }

    const root = resolveRoot();
    if (root) {
      const rows = candidateRows(root);
      const recognizedList =
        rows.length > 0 || Boolean(root.querySelector('.pvs-list, ul.artdeco-list'));
      sawRecognizedList ||= recognizedList;

      if (rows.length === 0) {
        const hasEmptyOwnerAction = [...root.querySelectorAll('button, a')].some((action) =>
          /^(ajouter un poste|add position)$/.test(
            cleanLine(action.textContent).toLocaleLowerCase()
          )
        );
        if (hasEmptyOwnerAction) {
          return snapshot('empty');
        }
      } else {
        const documentElement = document.documentElement;
        const height = documentElement.scrollHeight;
        documentElement.scrollTop = height;
        const bottomReached = documentElement.scrollTop + documentElement.clientHeight >= height;
        const hasActiveLoader = [
          ...document.querySelectorAll(
            '[aria-busy="true"], [role="progressbar"], .artdeco-loader, .pvs-loader'
          ),
        ].some(
          (loader) =>
            !loader.hasAttribute('hidden') && loader.getAttribute('aria-hidden') !== 'true'
        );

        if (rows.length === previousRowCount && height === previousHeight) {
          unchangedCycles += 1;
        } else {
          unchangedCycles = 0;
        }
        previousRowCount = rows.length;
        previousHeight = height;

        if (bottomReached && !hasActiveLoader && unchangedCycles >= stableCycles) {
          const leaves = leafRows(root);
          const experiences = leaves.map(({ row, inheritedCompany }, index) =>
            parseLeaf(row, inheritedCompany, index)
          );
          if (experiences.length === 0 || experiences.some((experience) => experience === null)) {
            return snapshot('unreadable');
          }
          return { kind: 'ready', experiences: experiences as RawExperience[] };
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

  return snapshot(sawRecognizedList ? 'timeout' : 'unreadable');
}
