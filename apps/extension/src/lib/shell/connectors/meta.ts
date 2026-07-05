export type ConnectorId = 'free-work' | 'lehibou' | 'hiway' | 'collective' | 'cherry-pick' | 'malt';

export interface ConnectorMeta {
  id: ConnectorId;
  name: string;
  icon: string;
  url: string;
}

export function getConnectorsMeta(): ConnectorMeta[] {
  return [
    {
      id: 'free-work',
      name: 'Free-Work',
      icon: 'https://www.google.com/s2/favicons?domain=free-work.com&sz=32',
      url: 'https://www.free-work.com',
    },
    {
      id: 'lehibou',
      name: 'LeHibou',
      icon: 'https://www.google.com/s2/favicons?domain=lehibou.com&sz=32',
      url: 'https://www.lehibou.com',
    },
    {
      id: 'hiway',
      name: 'Hiway',
      icon: 'https://www.google.com/s2/favicons?domain=hiway-missions.fr&sz=32',
      url: 'https://hiway-missions.fr',
    },
    {
      id: 'collective',
      name: 'Collective',
      icon: 'https://www.google.com/s2/favicons?domain=collective.work&sz=32',
      url: 'https://app.collective.work/',
    },
    {
      id: 'cherry-pick',
      name: 'Cherry Pick',
      icon: 'https://www.google.com/s2/favicons?domain=cherry-pick.io&sz=32',
      url: 'https://www.cherry-pick.io',
    },
    {
      id: 'malt',
      name: 'Malt',
      icon: 'https://www.google.com/s2/favicons?domain=malt.fr&sz=32',
      url: 'https://www.malt.fr',
    },
  ];
}
