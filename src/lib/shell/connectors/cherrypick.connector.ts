import type { GenericConnectorConfig } from './generic.connector';

export const CherryPickConfig: GenericConnectorConfig = {
  id: 'cherry-pick',
  name: 'Cherry Pick',
  baseUrl: 'https://cherry-pick.io',
  missionsPath: '/missions',
  idPrefix: 'cp',
  source: 'cherry-pick',
};
