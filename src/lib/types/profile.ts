import type { SeniorityLevel } from './tjm';
import type { RemoteType } from './mission';

export interface UserProfile {
  stack: string[];
  tjmMin: number;
  tjmMax: number;
  location: string;
  remote: RemoteType | 'any';
  seniority: SeniorityLevel;
  title: string;
}
