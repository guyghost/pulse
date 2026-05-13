import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import type { CvSnapshot, MissionApplication, PlatformSyncStatus } from '$lib/core/dashboard';

const mockApplications: MissionApplication[] = [
  {
    id: 'app-001',
    title: 'Lead Svelte / TypeScript',
    company: 'Atelier Nova',
    source: 'linkedin',
    stage: 'interview',
    score: 92,
    dailyRate: 720,
    location: 'Paris hybride',
    appliedAt: '2026-05-08',
    nextActionAt: '2026-05-15',
  },
  {
    id: 'app-002',
    title: 'Architecte Frontend freelance',
    company: 'ScaleOps',
    source: 'freework',
    stage: 'applied',
    score: 86,
    dailyRate: 680,
    location: 'Remote France',
    appliedAt: '2026-05-11',
    nextActionAt: null,
  },
  {
    id: 'app-003',
    title: 'Mission migration design system',
    company: 'Bluefoundry',
    source: 'malt',
    stage: 'draft',
    score: 78,
    dailyRate: 650,
    location: 'Lyon',
    appliedAt: null,
    nextActionAt: '2026-05-14',
  },
];

const mockCv: CvSnapshot = {
  id: 'cv-main',
  title: 'CV Consultant Frontend Senior',
  updatedAt: '2026-05-12T08:30:00.000Z',
  completeness: 84,
  targetRole: 'Lead Frontend Svelte / TypeScript',
  skills: [
    'Svelte 5',
    'TypeScript',
    'Design systems',
    'Chrome extensions',
    'Architecture frontend',
  ],
};

const mockSyncStatuses: PlatformSyncStatus[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    status: 'ready',
    lastSyncAt: '2026-05-12T09:10:00.000Z',
  },
  {
    id: 'freework',
    name: 'Free-Work',
    status: 'needs-session',
    lastSyncAt: null,
  },
  {
    id: 'malt',
    name: 'Malt',
    status: 'needs-extension',
    lastSyncAt: null,
  },
];

export const load: PageServerLoad = async ({ cookies }) => {
  const hasSupabaseConfig = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
  const session = hasSupabaseConfig
    ? (await createSupabaseServerClient(cookies).auth.getSession()).data.session
    : null;

  return {
    session,
    loginUrl: `${env.PUBLIC_LANDING_URL ?? ''}/login`,
    applications: mockApplications,
    cv: mockCv,
    syncStatuses: mockSyncStatuses,
  };
};
