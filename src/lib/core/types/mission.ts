export type MissionSource = 'free-work' | 'malt' | 'comet' | 'lehibou' | 'hiway' | 'collective' | 'cherry-pick';

export type RemoteType = 'full' | 'hybrid' | 'onsite';

export interface Mission {
  id: string;
  title: string;
  client: string | null;
  description: string;
  stack: string[];
  tjm: number | null;
  location: string | null;
  remote: RemoteType | null;
  duration: string | null;
  url: string;
  source: MissionSource;
  scrapedAt: Date;
  score: number | null;
}
