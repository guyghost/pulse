import type { GenericConnectorConfig } from './generic.connector';

export const HiwayConfig: GenericConnectorConfig = {
  id: 'hiway',
  name: 'Hiway',
  baseUrl: 'https://hiway-missions.fr',
  missionsPath: '/missions',
  idPrefix: 'hw',
  source: 'hiway',
};
