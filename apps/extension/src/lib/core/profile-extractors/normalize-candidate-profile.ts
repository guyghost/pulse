import type {
  CandidateEducationDraft,
  CandidateExperienceDraft,
  CandidateLinkDraft,
  CandidateSkillDraft,
  CanonicalCandidateProfileDraft,
  ProfileExtractorSource,
  RawEducation,
  RawExperience,
  RawPlatformProfile,
  RawProfileLink,
} from './types';

const MONTHS: Record<string, string> = {
  jan: '01',
  january: '01',
  janv: '01',
  janvier: '01',
  feb: '02',
  february: '02',
  fev: '02',
  fevr: '02',
  fevrier: '02',
  mar: '03',
  march: '03',
  mars: '03',
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

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function cleanMultiline(value: unknown): string {
  return typeof value === 'string'
    ? value
        .split('\n')
        .map((line) => cleanText(line))
        .filter(Boolean)
        .join('\n')
    : '';
}

function uniqueTexts(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const text = cleanText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(text);
  }

  return normalized;
}

function normalizeDatePart(part: string): { value: string | null; isCurrent: boolean } {
  const cleaned = cleanText(part)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace('.', '');

  if (!cleaned) {
    return { value: null, isCurrent: false };
  }

  if (
    cleaned.includes('present') ||
    cleaned.includes('current') ||
    cleaned.includes('aujourdhui') ||
    cleaned.includes('actuel')
  ) {
    return { value: null, isCurrent: true };
  }

  const year = cleaned.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;
  if (!year) {
    return { value: null, isCurrent: false };
  }

  const monthToken = cleaned.split(/[\s/-]+/).find((token) => MONTHS[token]);
  const month = monthToken ? MONTHS[monthToken] : '01';

  return { value: `${year}-${month}-01`, isCurrent: false };
}

export function parseProfileDateRange(dateRange: string | undefined): {
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
} {
  const normalized = cleanText(dateRange);
  if (!normalized) {
    return { startDate: null, endDate: null, isCurrent: false };
  }

  const [startRaw = '', endRaw = ''] = normalized.split(/\s+[–—-]\s+/, 2);
  const start = normalizeDatePart(startRaw);
  const end = normalizeDatePart(endRaw);

  return {
    startDate: start.value,
    endDate: end.value,
    isCurrent: end.isCurrent,
  };
}

function normalizeExperiences(
  experiences: readonly RawExperience[] | undefined,
  source: ProfileExtractorSource
): CandidateExperienceDraft[] {
  return (experiences ?? []).flatMap((experience, index) => {
    const title = cleanText(experience.title);
    if (!title) {
      return [];
    }

    const dates = parseProfileDateRange(experience.dateRange);
    return [
      {
        title,
        company: cleanText(experience.company) || null,
        location: cleanText(experience.location) || null,
        startDate: dates.startDate,
        endDate: dates.endDate,
        isCurrent: dates.isCurrent,
        description: cleanMultiline(experience.description),
        skills: uniqueTexts(experience.skills ?? []),
        source,
        sourceExternalId: cleanText(experience.externalId) || null,
        positionIndex: index,
      },
    ];
  });
}

function normalizeEducation(
  education: readonly RawEducation[] | undefined,
  source: ProfileExtractorSource
): CandidateEducationDraft[] {
  return (education ?? []).flatMap((item, index) => {
    const school = cleanText(item.school);
    if (!school) {
      return [];
    }

    const dates = parseProfileDateRange(item.dateRange);
    return [
      {
        school,
        degree: cleanText(item.degree) || null,
        field: cleanText(item.field) || null,
        startDate: dates.startDate,
        endDate: dates.endDate,
        description: cleanMultiline(item.description),
        source,
        positionIndex: index,
      },
    ];
  });
}

function normalizeSkills(
  skills: readonly string[] | undefined,
  experiences: readonly CandidateExperienceDraft[],
  source: ProfileExtractorSource
): CandidateSkillDraft[] {
  return uniqueTexts([
    ...(skills ?? []),
    ...experiences.flatMap((experience) => experience.skills),
  ]).map((skill) => ({
    skill,
    source,
    confidence: 0.8,
  }));
}

function normalizeLinks(
  links: readonly RawProfileLink[] | undefined,
  source: ProfileExtractorSource
): CandidateLinkDraft[] {
  return (links ?? []).flatMap((link) => {
    const label = cleanText(link.label);
    const url = cleanText(link.url);
    if (!label || !url || !url.startsWith('https://')) {
      return [];
    }
    return [{ label, url, source }];
  });
}

function computeConfidence(input: {
  title: string;
  summary: string;
  experiences: readonly CandidateExperienceDraft[];
  skills: readonly CandidateSkillDraft[];
  education: readonly CandidateEducationDraft[];
  links: readonly CandidateLinkDraft[];
}): number {
  const score =
    (input.title ? 0.2 : 0) +
    (input.summary ? 0.2 : 0) +
    (input.experiences.length > 0 ? 0.25 : 0) +
    (input.skills.length > 0 ? 0.2 : 0) +
    (input.education.length > 0 ? 0.1 : 0) +
    (input.links.length > 0 ? 0.05 : 0);

  return Math.round(score * 100) / 100;
}

export function normalizeCandidateProfile(raw: RawPlatformProfile): CanonicalCandidateProfileDraft {
  const title = cleanText(raw.sections.headline);
  const summary = cleanMultiline(raw.sections.summary);
  const experiences = normalizeExperiences(raw.sections.experiences, raw.source);
  const education = normalizeEducation(raw.sections.education, raw.source);
  const skills = normalizeSkills(raw.sections.skills, experiences, raw.source);
  const links = normalizeLinks(raw.sections.links, raw.source);
  const confidence = computeConfidence({ title, summary, experiences, skills, education, links });

  return {
    title,
    summary,
    experiences,
    skills,
    education,
    links,
    source: raw.source,
    confidence,
    capturedAt: raw.capturedAt.toISOString(),
    profileUrl: raw.profileUrl,
  };
}
