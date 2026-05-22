import { err, ok } from '../errors/result';
import { normalizeCandidateProfile } from './normalize-candidate-profile';
import type {
  ProfileExtractorParseError,
  ProfileExtractorParseResult,
  RawEducation,
  RawExperience,
  RawPlatformProfile,
  RawProfileLink,
} from './types';

function parseError(
  code: ProfileExtractorParseError['code'],
  message: string,
  field?: string
): ProfileExtractorParseError {
  return field ? { code, message, field } : { code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function rawExperiences(value: unknown): RawExperience[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    return [
      {
        title: optionalString(item.title),
        company: optionalString(item.company),
        location: optionalString(item.location),
        dateRange: optionalString(item.dateRange),
        description: optionalString(item.description),
        skills: stringArray(item.skills),
        externalId: optionalString(item.externalId),
      },
    ];
  });
}

function rawEducation(value: unknown): RawEducation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    return [
      {
        school: optionalString(item.school),
        degree: optionalString(item.degree),
        field: optionalString(item.field),
        dateRange: optionalString(item.dateRange),
        description: optionalString(item.description),
      },
    ];
  });
}

function rawLinks(value: unknown): RawProfileLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    return [
      {
        label: optionalString(item.label),
        url: optionalString(item.url),
      },
    ];
  });
}

export function parseLinkedInProfilePayload(raw: unknown): ProfileExtractorParseResult {
  if (!isRecord(raw)) {
    return err(parseError('malformed_payload', 'LinkedIn profile payload must be an object.'));
  }

  if (raw.source !== 'linkedin') {
    return err(
      parseError('unsupported_source', 'LinkedIn parser received an unsupported source.', 'source')
    );
  }

  if (typeof raw.profileUrl !== 'string' || !raw.profileUrl.startsWith('https://')) {
    return err(parseError('malformed_payload', 'LinkedIn profile URL is missing.', 'profileUrl'));
  }

  if (!(raw.capturedAt instanceof Date)) {
    return err(parseError('malformed_payload', 'Capture date must be injected.', 'capturedAt'));
  }

  if (!isRecord(raw.sections)) {
    return err(parseError('malformed_payload', 'LinkedIn sections are missing.', 'sections'));
  }

  const profile: RawPlatformProfile = {
    source: 'linkedin',
    profileUrl: raw.profileUrl,
    capturedAt: raw.capturedAt,
    sections: {
      headline: optionalString(raw.sections.headline),
      summary: optionalString(raw.sections.summary),
      experiences: rawExperiences(raw.sections.experiences),
      skills: stringArray(raw.sections.skills),
      education: rawEducation(raw.sections.education),
      links: rawLinks(raw.sections.links),
    },
  };
  const normalized = normalizeCandidateProfile(profile);

  if (
    !normalized.title &&
    !normalized.summary &&
    normalized.experiences.length === 0 &&
    normalized.skills.length === 0 &&
    normalized.education.length === 0
  ) {
    return err(
      parseError(
        'dom_changed',
        'LinkedIn payload did not include enough profile fields to build a CV draft.',
        'sections'
      )
    );
  }

  return ok(normalized);
}
