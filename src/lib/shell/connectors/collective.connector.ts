import { createGenericConnector } from './generic.connector';

export const CollectiveConnector = createGenericConnector({
  id: 'collective',
  name: 'Collective',
  baseUrl: 'https://collective.work',
  missionsPath: '/missions',
  idPrefix: 'col',
  source: 'collective',
});
