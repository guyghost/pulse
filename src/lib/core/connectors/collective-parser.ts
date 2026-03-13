import type { Mission } from '../types/mission';
import { parseGenericHTML } from './generic-parser';

export function parseCollectiveHTML(html: string, now: Date, idPrefix: string): Mission[] {
  return parseGenericHTML(html, 'collective', 'https://collective.work', now, idPrefix);
}
