import { createGenericConnector } from './generic.connector';

export const CherryPickConnector = createGenericConnector({
  id: 'cherry-pick',
  name: 'Cherry Pick',
  baseUrl: 'https://cherry-pick.io',
  missionsPath: '/missions',
  idPrefix: 'cp',
  source: 'cherry-pick',
});
