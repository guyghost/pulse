import type { Mission } from '../types/mission';
import { parseGenericHTML } from './generic-parser';

export function parseCherryPickHTML(html: string, now: Date, idPrefix: string): Mission[] {
  return parseGenericHTML(html, 'cherry-pick', 'https://cherry-pick.io', now, idPrefix);
}
