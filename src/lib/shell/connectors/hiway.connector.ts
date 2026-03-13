import { createGenericConnector } from './generic.connector';

export const HiwayConnector = createGenericConnector({
  id: 'hiway',
  name: 'Hiway',
  baseUrl: 'https://hiway-missions.fr',
  missionsPath: '/missions',
  idPrefix: 'hw',
  source: 'hiway',
});
