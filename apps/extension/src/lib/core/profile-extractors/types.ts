import type { Result } from '../errors/result';

export type ProfileExtractorSource = string;

export interface RawExperience {
  title?: string;
  company?: string;
  employmentType?: string;
  location?: string;
  dateRange?: string;
  description?: string;
  skills?: string[];
  externalId?: string;
}

export interface RawEducation {
  school?: string;
  degree?: string;
  field?: string;
  dateRange?: string;
  description?: string;
}

export interface RawProfileLink {
  label?: string;
  url?: string;
}

export interface RawPlatformProfile {
  source: ProfileExtractorSource;
  profileUrl: string;
  capturedAt: Date;
  sections: {
    headline?: string;
    summary?: string;
    experiences?: RawExperience[];
    skills?: string[];
    education?: RawEducation[];
    links?: RawProfileLink[];
  };
}

export interface CandidateExperienceDraft {
  title: string;
  company: string | null;
  employmentType: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  skills: string[];
  source: ProfileExtractorSource;
  sourceExternalId: string | null;
  positionIndex: number;
}

export interface CandidateEducationDraft {
  school: string;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string;
  source: ProfileExtractorSource;
  positionIndex: number;
}

export interface CandidateSkillDraft {
  skill: string;
  source: ProfileExtractorSource;
  confidence: number;
}

export interface CandidateLinkDraft {
  label: string;
  url: string;
  source: ProfileExtractorSource;
}

export interface CanonicalCandidateProfileDraft {
  title: string;
  summary: string;
  experiences: CandidateExperienceDraft[];
  skills: CandidateSkillDraft[];
  education: CandidateEducationDraft[];
  links: CandidateLinkDraft[];
  source: ProfileExtractorSource;
  confidence: number;
  capturedAt: string;
  profileUrl: string;
}

export type ProfileExtractorParseErrorCode =
  'malformed_payload' | 'unsupported_source' | 'dom_changed';

export interface ProfileExtractorParseError {
  code: ProfileExtractorParseErrorCode;
  message: string;
  field?: string;
}

export type ProfileExtractorParseResult = Result<
  CanonicalCandidateProfileDraft,
  ProfileExtractorParseError
>;
