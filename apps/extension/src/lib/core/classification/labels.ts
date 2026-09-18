/**
 * Category labels — French display names for mission categories.
 *
 * Pure data module: the product targets francophone freelancers, so the
 * rendered copy lives here (core) where both molecules and organisms can
 * consume it without importing UI state.
 */

import type { MissionCategory } from '../types/mission-classification';

export const MISSION_CATEGORY_LABELS: Readonly<Record<MissionCategory, string>> = {
  frontend: 'Front-end',
  backend: 'Back-end',
  fullstack: 'Full stack',
  mobile: 'Mobile',
  data: 'Data',
  devops: 'DevOps',
  product: 'Produit',
  design: 'Design',
  other: 'Autre',
};

export const missionCategoryLabel = (category: MissionCategory): string =>
  MISSION_CATEGORY_LABELS[category];
