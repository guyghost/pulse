import { createConnectorError, type AppError } from '../../core/errors/app-error';

export type ProfileExtractorErrorCode =
  | 'permission_required'
  | 'session_required'
  | 'profile_not_found'
  | 'dom_changed'
  | 'rate_limited_or_blocked'
  | 'sync_failed';

export function createProfileExtractorError(
  code: ProfileExtractorErrorCode,
  message: string,
  now: number,
  context: Record<string, unknown> = {}
): AppError {
  return createConnectorError(
    message,
    {
      connectorId: 'linkedin',
      phase: code === 'session_required' || code === 'permission_required' ? 'detect' : 'parse',
      recoverable: code !== 'dom_changed',
      context: {
        profileExtractorCode: code,
        ...context,
      },
    },
    now
  );
}
