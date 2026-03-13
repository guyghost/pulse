import type { Mission } from '../types/mission';
import { parseGenericHTML } from './generic-parser';

export function parseLeHibouHTML(html: string, now: Date, idPrefix: string): Mission[] {
  return parseGenericHTML(html, 'lehibou', 'https://www.lehibou.com', now, idPrefix);
}
