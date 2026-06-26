import type { AppError } from '../../core/errors/app-error';
import type { Result } from '../../core/errors/result';
import type { CanonicalCandidateProfileDraft } from '../../core/profile-extractors/types';

export interface PlatformProfileExtractor {
  readonly id: string;
  readonly name: string;

  detectSession(now: number): Promise<Result<boolean, AppError>>;
  extractProfile(
    now: number,
    tabId?: number
  ): Promise<Result<CanonicalCandidateProfileDraft, AppError>>;
}
