import { describe, it, expect } from 'vitest';
import {
  parseCherryPickMissions,
  parseDescriptionMeta,
} from '../../../src/lib/core/connectors/cherrypick-parser';
import { CherryPickConnector } from '../../../src/lib/shell/connectors/cherrypick.connector';

const NOW = new Date('2026-03-15T12:00:00Z');

const FIXTURE_MISSIONS = [
  {
    id: 1234,
    name: 'Dev React Senior',
    slug: 'dev-react-senior-1234',
    minimum_rate: 500,
    maximum_rate: 700,
    duration: '6 mois',
    city: 'Paris',
    displacement: 'partially_remote_3',
    company: { name: 'Acme Corp' },
    skills: [{ name: 'React' }, { name: 'TypeScript' }],
    description: 'Mission React pour projet e-commerce',
  },
  {
    id: 5678,
    name: 'Lead Java Spring',
    slug: 'lead-java-spring-5678',
    minimum_rate: null,
    maximum_rate: 650,
    duration: '3 mois',
    city: 'Lyon',
    displacement: 'remote',
    company: { name: 'Tech SA' },
    skills: [{ name: 'Java' }, { name: 'Spring' }],
    description: null,
  },
];

describe('parseCherryPickMissions', () => {
  it('parse les missions depuis la reponse API', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions).toHaveLength(2);
    expect(missions[0]).toMatchObject({
      source: 'cherry-pick',
      title: 'Dev React Senior',
      id: 'cp-1234',
      scrapedAt: NOW,
    });
  });

  it('extrait un ID stable depuis l ID numerique', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].id).toBe('cp-1234');
    expect(missions[1].id).toBe('cp-5678');
  });

  it('extrait les tags de stack', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].stack).toEqual(['React', 'TypeScript']);
  });

  it('mappe displacement vers RemoteType', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].remote).toBe('hybrid');
    expect(missions[1].remote).toBe('full');
  });

  it('calcule le TJM moyen depuis min/max rates', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].tjm).toBe(600);
  });

  it('utilise max rate si min est null', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[1].tjm).toBe(650);
  });

  it('extrait le client depuis company.name', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].client).toBe('Acme Corp');
  });

  it('construit l URL depuis le slug', () => {
    const missions = parseCherryPickMissions(FIXTURE_MISSIONS, NOW);
    expect(missions[0].url).toBe('https://app.cherry-pick.io/ext/missions/dev-react-senior-1234');
  });

  it('retourne un tableau vide pour un tableau vide', () => {
    expect(parseCherryPickMissions([], NOW)).toEqual([]);
  });

  it('gere company null', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          company: null,
        },
      ],
      NOW
    );
    expect(missions[0].client).toBeNull();
  });

  it('mappe no_remote vers onsite', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          displacement: 'no_remote',
        },
      ],
      NOW
    );
    expect(missions[0].remote).toBe('onsite');
  });

  it('retourne null pour displacement null', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          displacement: null,
        },
      ],
      NOW
    );
    expect(missions[0].remote).toBeNull();
  });

  it('retourne null pour tjm quand min et max sont null', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          minimum_rate: null,
          maximum_rate: null,
        },
      ],
      NOW
    );
    expect(missions[0].tjm).toBeNull();
  });

  it('extrait TJM depuis la description quand les rates API sont null', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          minimum_rate: null,
          maximum_rate: null,
          description:
            'Qualification faite par : AO Nom du client : Agirc-Arrco TJM : 930/1030 Localisation de la mission : Paris 12eme',
        },
      ],
      NOW
    );
    expect(missions[0].tjm).toBe(980);
  });

  it('prefere les rates API au TJM de la description', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          minimum_rate: 500,
          maximum_rate: 700,
          description: 'TJM : 930/1030',
        },
      ],
      NOW
    );
    expect(missions[0].tjm).toBe(600);
  });

  it('extrait client et location depuis la description si champs API manquants', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          company: null,
          city: null,
          description: 'Nom du client : Agirc-Arrco Localisation de la mission : Paris 12eme',
        },
      ],
      NOW
    );
    expect(missions[0].client).toBe('Agirc-Arrco');
    expect(missions[0].location).toBe('Paris 12eme');
  });

  it('nettoie la description en retirant les metadonnees', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          description: 'Qualification faite par : AO Nom du client : Agirc-Arrco TJM : 930/1030',
        },
      ],
      NOW
    );
    expect(missions[0].description).not.toContain('Qualification faite par');
    expect(missions[0].description).not.toContain('Agirc-Arrco');
  });

  it('ajoute mois a une duree numerique', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          duration: '12',
        },
      ],
      NOW
    );
    expect(missions[0].duration).toBe('12 mois');
  });

  it('garde la duree si elle contient deja une unite', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          duration: '6 mois',
        },
      ],
      NOW
    );
    expect(missions[0].duration).toBe('6 mois');
  });

  it('gere une duree numerique (number) depuis l API', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          duration: 6 as unknown as string,
        },
      ],
      NOW
    );
    expect(missions[0].duration).toBe('6 mois');
  });

  it('gere skills en format string[] au lieu de {name}[]', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          skills: ['React', 'Node'] as unknown as { name: string }[],
        },
      ],
      NOW
    );
    expect(missions[0].stack).toEqual(['React', 'Node']);
  });

  it('gere skills null', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          skills: null as unknown as { name: string }[],
        },
      ],
      NOW
    );
    expect(missions[0].stack).toEqual([]);
  });
});

describe('CherryPickConnector.detectSession', () => {
  it('returns true even when no browser session is available because the API is public', async () => {
    const connector = new CherryPickConnector();

    await expect(connector.detectSession(Date.now())).resolves.toEqual({
      ok: true,
      value: true,
    });
  });
});

describe('parseDescriptionMeta', () => {
  it('parse les paires cle-valeur du format CherryPick', () => {
    const raw =
      "Qualification faite par : AO Nom du client : Agirc-Arrco Nom de l'opérationnel : Christophe Baron Type de besoin : Freelance TJM : 930/1030 Nombre de postes ouvert : 1 Localisation de la mission : Paris 12eme";
    const meta = parseDescriptionMeta(raw);
    expect(meta.client).toBe('Agirc-Arrco');
    expect(meta.tjm).toBe(980);
    expect(meta.location).toBe('Paris 12eme');
  });

  it('parse un TJM simple (sans range)', () => {
    const meta = parseDescriptionMeta('TJM : 650');
    expect(meta.tjm).toBe(650);
  });

  it('retourne des nulls pour une description vide', () => {
    const meta = parseDescriptionMeta(null);
    expect(meta.client).toBeNull();
    expect(meta.tjm).toBeNull();
    expect(meta.location).toBeNull();
    expect(meta.cleanDescription).toBe('');
  });

  it('retourne des nulls pour une description sans metadonnees', () => {
    const meta = parseDescriptionMeta('Mission React pour projet e-commerce');
    expect(meta.client).toBeNull();
    expect(meta.tjm).toBeNull();
    expect(meta.cleanDescription).toBe('Mission React pour projet e-commerce');
  });

  it('extrait la duree (avec accent) depuis la description', () => {
    const meta = parseDescriptionMeta('Durée de la mission : 6 mois');
    expect(meta.duration).toBe('6 mois');
  });

  it('extrait la duree (sans accent) depuis la description', () => {
    const meta = parseDescriptionMeta('Duree de la mission : 9 mois');
    expect(meta.duration).toBe('9 mois');
  });

  it('parse un TJM en range avec slash', () => {
    const meta = parseDescriptionMeta('TJM : 500/600');
    expect(meta.tjm).toBe(550);
  });

  it('nettoie une description contenant uniquement des metadonnees', () => {
    const meta = parseDescriptionMeta('TJM : 650 Localisation de la mission : Paris');
    expect(meta.cleanDescription).toBe('');
  });

  it('ignore les valeurs vides apres une cle', () => {
    const meta = parseDescriptionMeta('TJM :  Nom du client : Acme');
    expect(meta.tjm).toBeNull();
    expect(meta.client).toBe('Acme');
  });
});

// ---------------------------------------------------------------------------
// mapRemote / pickTJM / normalizeDuration — exercised through parseCherryPickMissions
// (these helpers are module-private) plus edge-case missions.
// ---------------------------------------------------------------------------
describe('parseCherryPickMissions (remote & rate edge cases)', () => {
  it('mappe un displacement inconnu (non partially_remote) vers null', () => {
    const missions = parseCherryPickMissions(
      [{ ...FIXTURE_MISSIONS[0], displacement: 'unknown_value' }],
      NOW
    );
    expect(missions[0].remote).toBeNull();
  });

  it('mappe un displacement partially_remote sans suffixe vers hybrid', () => {
    const missions = parseCherryPickMissions(
      [{ ...FIXTURE_MISSIONS[0], displacement: 'partially_remote' }],
      NOW
    );
    expect(missions[0].remote).toBe('hybrid');
  });

  it('mappe partially_remote_5 vers hybrid (startsWith)', () => {
    const missions = parseCherryPickMissions(
      [{ ...FIXTURE_MISSIONS[0], displacement: 'partially_remote_5' }],
      NOW
    );
    expect(missions[0].remote).toBe('hybrid');
  });

  it('utilise seulement le min rate quand max est null', () => {
    const missions = parseCherryPickMissions(
      [{ ...FIXTURE_MISSIONS[0], minimum_rate: 550, maximum_rate: null }],
      NOW
    );
    expect(missions[0].tjm).toBe(550);
  });

  it('traite un rate NaN comme absent (retourne lautre borne)', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          minimum_rate: NaN,
          maximum_rate: 700,
        },
      ],
      NOW
    );
    expect(missions[0].tjm).toBe(700);
  });

  it('retourne tjm null quand min et max sont NaN', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          minimum_rate: NaN,
          maximum_rate: NaN,
          description: null,
        },
      ],
      NOW
    );
    expect(missions[0].tjm).toBeNull();
  });

  it('retourne tjm null quand les rates sont absents et la description na pas de TJM', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          minimum_rate: null,
          maximum_rate: null,
          description: 'Mission sans info budget',
        },
      ],
      NOW
    );
    expect(missions[0].tjm).toBeNull();
  });
});

describe('parseCherryPickMissions (duration fallback chain)', () => {
  it('retourne null pour une duration null sans meta.duration', () => {
    const missions = parseCherryPickMissions(
      [{ ...FIXTURE_MISSIONS[0], duration: null, description: null }],
      NOW
    );
    expect(missions[0].duration).toBeNull();
  });

  it('utilise meta.duration quand le champ API duration est null', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          duration: null,
          description: 'Durée de la mission : 12 mois',
        },
      ],
      NOW
    );
    expect(missions[0].duration).toBe('12 mois');
  });

  it('normalise une duration API numerique en lui ajoutant "mois"', () => {
    const missions = parseCherryPickMissions(
      [{ ...FIXTURE_MISSIONS[0], duration: 9 as unknown as string }],
      NOW
    );
    expect(missions[0].duration).toBe('9 mois');
  });

  it('retourne null pour une duration vide', () => {
    const missions = parseCherryPickMissions([{ ...FIXTURE_MISSIONS[0], duration: '' }], NOW);
    expect(missions[0].duration).toBeNull();
  });

  it('garde une duration null quand API et meta sont tous deux null/absents', () => {
    const missions = parseCherryPickMissions(
      [{ ...FIXTURE_MISSIONS[0], duration: null, description: null }],
      NOW
    );
    expect(missions[0].duration).toBeNull();
  });
});

describe('parseCherryPickMissions (location & client fallback chains)', () => {
  it('utilise meta.location quand city est null', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          city: null,
          description: 'Localisation de la mission : Toulouse',
        },
      ],
      NOW
    );
    expect(missions[0].location).toBe('Toulouse');
  });

  it('prefere city au meta.location quand les deux sont presents', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          city: 'Bordeaux',
          description: 'Localisation de la mission : Toulouse',
        },
      ],
      NOW
    );
    expect(missions[0].location).toBe('Bordeaux');
  });

  it('retourne location null quand city et meta.location sont absents', () => {
    const missions = parseCherryPickMissions(
      [{ ...FIXTURE_MISSIONS[0], city: null, description: null }],
      NOW
    );
    expect(missions[0].location).toBeNull();
  });

  it('utilise meta.client quand company est null', () => {
    const missions = parseCherryPickMissions(
      [
        {
          ...FIXTURE_MISSIONS[0],
          company: null,
          description: 'Nom du client : BigBank',
        },
      ],
      NOW
    );
    expect(missions[0].client).toBe('BigBank');
  });
});

describe('parseCherryPickMissions (publishedAt & encoding)', () => {
  it('extrait publishedAt depuis created_at', () => {
    const missions = parseCherryPickMissions(
      [{ ...FIXTURE_MISSIONS[0], created_at: '2026-03-10T08:00:00Z' }],
      NOW
    );
    expect(missions[0].publishedAt).toBe('2026-03-10T08:00:00Z');
  });

  it('retourne publishedAt null quand created_at est null', () => {
    const missions = parseCherryPickMissions([{ ...FIXTURE_MISSIONS[0], created_at: null }], NOW);
    expect(missions[0].publishedAt).toBeNull();
  });

  it('preserve les accents dans le nom de mission', () => {
    const missions = parseCherryPickMissions(
      [{ ...FIXTURE_MISSIONS[0], name: 'Développeur Confirmé Écosystème' }],
      NOW
    );
    expect(missions[0].title).toBe('Développeur Confirmé Écosystème');
  });
});
