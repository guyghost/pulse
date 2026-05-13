export type ApplicationStage = 'draft' | 'applied' | 'interview' | 'offer' | 'rejected';

export type ApplicationSource = 'linkedin' | 'freework' | 'malt' | 'other';

export interface MissionApplication {
  id: string;
  title: string;
  company: string;
  source: ApplicationSource;
  stage: ApplicationStage;
  score: number;
  dailyRate: number | null;
  location: string;
  appliedAt: string | null;
  nextActionAt: string | null;
}

export interface CvSnapshot {
  id: string;
  title: string;
  updatedAt: string;
  completeness: number;
  targetRole: string;
  skills: string[];
}

export interface PlatformSyncStatus {
  id: ApplicationSource;
  name: string;
  status: 'ready' | 'needs-extension' | 'needs-session' | 'syncing';
  lastSyncAt: string | null;
}

export const countApplicationsByStage = (applications: MissionApplication[]) =>
  applications.reduce<Record<ApplicationStage, number>>(
    (counts, application) => ({
      ...counts,
      [application.stage]: counts[application.stage] + 1,
    }),
    {
      draft: 0,
      applied: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
    }
  );

export const getCvSyncReadiness = (cv: CvSnapshot, statuses: PlatformSyncStatus[]) => {
  const readyPlatforms = statuses.filter((status) => status.status === 'ready').length;

  return {
    readyPlatforms,
    totalPlatforms: statuses.length,
    canSync: cv.completeness >= 80 && readyPlatforms > 0,
  };
};
