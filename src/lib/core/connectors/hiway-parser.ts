import type { Mission } from '../types/mission';
import { parseGenericHTML } from './generic-parser';

export function parseHiwayHTML(html: string, now: Date, idPrefix: string): Mission[] {
  return parseGenericHTML(html, 'hiway', 'https://hiway-missions.fr', now, idPrefix);
}
