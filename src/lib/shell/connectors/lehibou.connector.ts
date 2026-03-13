import { createGenericConnector } from './generic.connector';

export const LeHibouConnector = createGenericConnector({
  id: 'lehibou',
  name: 'LeHibou',
  baseUrl: 'https://www.lehibou.com',
  missionsPath: '/missions',
  idPrefix: 'lh',
  source: 'lehibou',
});
