import type { Mission } from '../types/mission';
import type { UserProfile } from '../types/profile';

export function scoreMission(mission: Mission, profile: UserProfile): number {
  const stackScore = scoreStack(mission.stack, profile.stack);
  const locationScore = scoreLocation(mission.location, profile.location);
  const tjmScore = scoreTJM(mission.tjm, profile.tjmMin, profile.tjmMax);
  const remoteScore = scoreRemote(mission.remote, profile.remote);

  return Math.round(stackScore + locationScore + tjmScore + remoteScore);
}

function scoreStack(missionStack: string[], profileStack: string[]): number {
  if (missionStack.length === 0) return 0;
  const normalizedProfile = profileStack.map((s) => s.toLowerCase());
  const matches = missionStack.filter((s) =>
    normalizedProfile.includes(s.toLowerCase()),
  );
  return (matches.length / missionStack.length) * 40;
}

function scoreLocation(
  missionLocation: string | null,
  profileLocation: string,
): number {
  if (missionLocation === null) return 10;
  return missionLocation.toLowerCase().includes(profileLocation.toLowerCase())
    ? 20
    : 0;
}

function scoreTJM(
  missionTjm: number | null,
  min: number,
  max: number,
): number {
  if (missionTjm === null) return 12;
  if (missionTjm >= min && missionTjm <= max) return 25;
  const distance = missionTjm < min ? min - missionTjm : missionTjm - max;
  const rangeSize = max - min || 1;
  const ratio = Math.max(0, 1 - distance / rangeSize);
  return Math.round(ratio * 25);
}

function scoreRemote(
  missionRemote: string | null,
  profileRemote: string,
): number {
  if (profileRemote === 'any') return 15;
  if (missionRemote === null) return 7;
  return missionRemote === profileRemote ? 15 : 0;
}
