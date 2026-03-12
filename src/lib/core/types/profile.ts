import type { SeniorityLevel } from './tjm';
import type { RemoteType } from './mission';

export interface UserProfile {
  firstName: string;
  stack: string[];
  tjmMin: number;
  tjmMax: number;
  location: string;
  remote: RemoteType | 'any';
  seniority: SeniorityLevel;
  jobTitle: string;
}
