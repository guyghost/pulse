import type { UserProfile } from '../types/profile';

export type ProfileImpactFieldId =
  | 'keywords'
  | 'tjm-min'
  | 'remote'
  | 'location'
  | 'job-title'
  | 'tjm-max'
  | 'first-name';

export type ProfileImpactInput = Pick<
  UserProfile,
  'firstName' | 'jobTitle' | 'location' | 'remote' | 'tjmMin' | 'tjmMax' | 'keywords'
>;

export interface ProfileImpactItem {
  id: ProfileImpactFieldId;
  label: string;
  complete: boolean;
  weight: number;
  impact: string;
  action: string;
}

export interface ProfileImpactSimulation {
  currentCompletion: number;
  nextCompletion: number;
  delta: number;
  prioritizedItems: ProfileImpactItem[];
  title: string;
  description: string;
}

interface ProfileImpactDefinition {
  id: ProfileImpactFieldId;
  label: string;
  weight: number;
  impact: string;
  action: string;
  isComplete: (profile: ProfileImpactInput) => boolean;
}

const PROFILE_IMPACT_DEFINITIONS: ProfileImpactDefinition[] = [
  {
    id: 'keywords',
    label: 'Mots-clés',
    weight: 35,
    impact: 'Scoring de pertinence, recherche connecteur et alertes ciblées',
    action: 'Ajouter technologies, secteurs ou contextes (ex. React, SaaS, fintech).',
    isComplete: (profile) => profile.keywords.length > 0,
  },
  {
    id: 'tjm-min',
    label: 'TJM minimum',
    weight: 20,
    impact: 'Missions à négocier ou à écarter',
    action: 'Fixer le plancher sous lequel une mission doit être négociée.',
    isComplete: (profile) => profile.tjmMin > 0,
  },
  {
    id: 'remote',
    label: 'Mode de travail',
    weight: 15,
    impact: 'Compatibilité remote, hybride ou présentiel',
    action: 'Choisir le mode de travail qui doit influencer le score.',
    isComplete: (profile) => profile.remote !== 'any',
  },
  {
    id: 'location',
    label: 'Localisation',
    weight: 15,
    impact: 'Pondération des missions proches ou hybrides',
    action: 'Renseigner la zone qui doit servir de référence au radar.',
    isComplete: (profile) => profile.location.trim().length > 0,
  },
  {
    id: 'job-title',
    label: 'Poste cible',
    weight: 8,
    impact: 'Requêtes et textes générés plus cohérents',
    action: 'Nommer le rôle que les plateformes doivent refléter.',
    isComplete: (profile) => profile.jobTitle.trim().length > 0,
  },
  {
    id: 'tjm-max',
    label: 'TJM maximum',
    weight: 5,
    impact: 'Fourchette réaliste pour comparer les opportunités',
    action: 'Définir le haut de fourchette attendu pour les missions idéales.',
    isComplete: (profile) => profile.tjmMax > 0,
  },
  {
    id: 'first-name',
    label: 'Prénom',
    weight: 2,
    impact: 'Personnalisation des messages générés',
    action: 'Ajouter le prénom utilisé dans les brouillons de candidature.',
    isComplete: (profile) => profile.firstName.trim().length > 0,
  },
];

function weightedCompletion(items: ProfileImpactItem[]): number {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) {
    return 0;
  }

  const completeWeight = items
    .filter((item) => item.complete)
    .reduce((sum, item) => sum + item.weight, 0);

  return Math.round((completeWeight / totalWeight) * 100);
}

export function buildProfileImpactItems(profile: ProfileImpactInput): ProfileImpactItem[] {
  return PROFILE_IMPACT_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    complete: definition.isComplete(profile),
    weight: definition.weight,
    impact: definition.impact,
    action: definition.action,
  }));
}

export function computeProfileImpactCompletion(items: ProfileImpactItem[]): number {
  return weightedCompletion(items);
}

export function buildProfileImpactSimulation(items: ProfileImpactItem[]): ProfileImpactSimulation {
  const currentCompletion = weightedCompletion(items);
  const prioritizedItems = items.filter((item) => !item.complete).slice(0, 3);
  const simulatedItems = items.map((item) =>
    prioritizedItems.some((priority) => priority.id === item.id)
      ? { ...item, complete: true }
      : item
  );
  const nextCompletion = weightedCompletion(simulatedItems);
  const delta = Math.max(0, nextCompletion - currentCompletion);

  if (prioritizedItems.length === 0) {
    return {
      currentCompletion,
      nextCompletion,
      delta,
      prioritizedItems,
      title: 'Le radar profil utilise déjà tous les signaux clés',
      description:
        'Les mots-clés, le TJM, le remote et la localisation alimentent les recherches, le scoring et les alertes.',
    };
  }

  const labels = prioritizedItems.map((item) => item.label).join(', ');

  return {
    currentCompletion,
    nextCompletion,
    delta,
    prioritizedItems,
    title: `Compléter ${labels} ferait passer le radar à ${nextCompletion}%`,
    description:
      'Simulation locale : ces champs ont le plus fort impact sur la réduction du bruit et la qualité des alertes.',
  };
}
