import {
  isCopilotTransmissionAllowed,
  isValidCopilotConsentSelection,
  type CopilotConsentSelection,
  type CopilotMissionData,
  type CopilotProfileData,
  type CopilotTransmittedPayload,
} from '@pulse/domain';

import type { Mission } from '../types/mission';
import type { Experience, UserProfile } from '../types/profile';

export type CopilotPayloadBuildErrorCode =
  'INVALID_CONSENT' | 'EVIDENCE_NOT_FOUND' | 'EVIDENCE_INVALID' | 'PAYLOAD_REJECTED';

export type CopilotPayloadBuildResult =
  | { ok: true; payload: CopilotTransmittedPayload }
  | { ok: false; code: CopilotPayloadBuildErrorCode };

function projectMission(mission: Mission, selection: CopilotConsentSelection): CopilotMissionData {
  const projected: CopilotMissionData = {};

  for (const field of selection.missionFields) {
    switch (field) {
      case 'title':
        projected.title = mission.title;
        break;
      case 'description':
        projected.description = mission.description;
        break;
      case 'client':
        projected.client = mission.client;
        break;
      case 'stack':
        projected.stack = [...mission.stack];
        break;
      case 'location':
        projected.location = mission.location;
        break;
      case 'remoteMode':
        projected.remoteMode = mission.remote;
        break;
      case 'duration':
        projected.duration = mission.duration;
        break;
      case 'startDate':
        projected.startDate = mission.startDate;
        break;
      case 'displayedTjm':
        projected.displayedTjm =
          mission.tjm === null ? null : { min: mission.tjm, max: mission.tjm, currency: 'EUR' };
        break;
    }
  }

  return projected;
}

function projectProfile(
  profile: UserProfile,
  selection: CopilotConsentSelection
): CopilotProfileData {
  const projected: CopilotProfileData = {};

  for (const field of selection.profileFields) {
    switch (field) {
      case 'jobTitle':
        projected.jobTitle = profile.jobTitle;
        break;
      case 'seniority':
        projected.seniority = profile.seniority;
        break;
      case 'location':
        projected.location = profile.location || null;
        break;
      case 'keywords':
        projected.keywords = [...profile.keywords];
        break;
      case 'stack':
        projected.stack = [...profile.keywords];
        break;
      case 'tjmBounds':
        projected.tjmBounds = {
          min: profile.tjmMin,
          target: Math.round((profile.tjmMin + profile.tjmMax) / 2),
          max: profile.tjmMax,
          currency: 'EUR',
        };
        break;
    }
  }

  return projected;
}

function projectEvidence(
  experiences: readonly Experience[],
  selection: CopilotConsentSelection
): CopilotPayloadBuildResult | CopilotTransmittedPayload['experienceEvidence'] {
  const byId = new Map(experiences.map((experience) => [experience.id, experience]));
  const projected: CopilotTransmittedPayload['experienceEvidence'][number][] = [];

  for (const evidenceId of selection.evidenceIds) {
    const experience = byId.get(evidenceId);
    if (!experience) {
      return { ok: false, code: 'EVIDENCE_NOT_FOUND' };
    }
    if (!experience.title.trim() || !experience.description.trim()) {
      return { ok: false, code: 'EVIDENCE_INVALID' };
    }
    projected.push({
      evidenceId: experience.id,
      role: experience.title,
      company: experience.company,
      summary: experience.description,
      skills: [...experience.skills],
    });
  }

  return projected;
}

/**
 * Pure projection used at the last local boundary before the remote request.
 * It never accepts caller-provided mission/profile content.
 */
export function buildConsentedCopilotPayload(
  mission: Mission,
  profile: UserProfile,
  selection: CopilotConsentSelection
): CopilotPayloadBuildResult {
  if (!isValidCopilotConsentSelection(selection)) {
    return { ok: false, code: 'INVALID_CONSENT' };
  }

  const experienceEvidence = projectEvidence(profile.experiences, selection);
  if ('ok' in experienceEvidence) {
    return experienceEvidence;
  }

  const payload: CopilotTransmittedPayload = {
    mission: projectMission(mission, selection),
    profile: projectProfile(profile, selection),
    experienceEvidence,
  };

  return isCopilotTransmissionAllowed(payload, selection)
    ? { ok: true, payload }
    : { ok: false, code: 'PAYLOAD_REJECTED' };
}
