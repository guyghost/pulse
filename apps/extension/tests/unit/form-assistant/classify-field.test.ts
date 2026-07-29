import { describe, it, expect } from 'vitest';
import { classifyField } from '../../../src/lib/core/form-assistant/classify-field';
import type { RawFieldInput } from '../../../src/lib/core/form-assistant/types';

function raw(
  label: string,
  placeholder = '',
  inputType: RawFieldInput['inputType'] = 'text'
): RawFieldInput {
  return { label, placeholder, inputType, required: false };
}

describe('classifyField — signal fort inputType', () => {
  it('classifie email via inputType', () => {
    expect(classifyField(raw('Contact', '', 'email')).kind).toBe('email');
  });
  it('classifie phone via inputType tel', () => {
    expect(classifyField(raw('Contact', '', 'tel')).kind).toBe('phone');
  });
  it('classifie linkedin pour inputType url + mot-clé', () => {
    expect(classifyField(raw('LinkedIn', '', 'url')).kind).toBe('linkedin');
  });
  it('laisse url générique en free-text si pas linkedin', () => {
    expect(classifyField(raw('Site web', '', 'url')).kind).toBe('free-text');
  });
});

describe('classifyField — insensible aux accents/casse', () => {
  it('prénom avec accent → first-name', () => {
    expect(classifyField(raw('Prénom')).kind).toBe('first-name');
  });
  it('PRENOM majuscule sans accent → first-name', () => {
    expect(classifyField(raw('PRENOM')).kind).toBe('first-name');
  });
  it('téléphone → phone', () => {
    expect(classifyField(raw('Téléphone')).kind).toBe('phone');
  });
  it('disponibilité → availability', () => {
    expect(classifyField(raw('Disponibilité')).kind).toBe('availability');
  });
  it('compétences → skill', () => {
    expect(classifyField(raw('Compétences')).kind).toBe('skill');
  });
});

describe('classifyField — spécificité (ordre des règles)', () => {
  it('"nom de famille" → last-name (pas full-name)', () => {
    expect(classifyField(raw('Nom de famille')).kind).toBe('last-name');
  });
  it('"votre nom" → full-name', () => {
    expect(classifyField(raw('Votre nom')).kind).toBe('full-name');
  });
  it('"lettre de motivation" → cover-letter', () => {
    expect(classifyField(raw('Lettre de motivation')).kind).toBe('cover-letter');
  });
  it('"nom de l\'entreprise" → free-text (pas full-name)', () => {
    // "entreprise" est un marqueur org/user : on ne doit PAS dériver un kind "name"
    // pour éviter de proposer le nom du freelance.
    expect(classifyField(raw("Nom de l'entreprise")).kind).toBe('free-text');
  });
  it('"company name" → free-text (pas full-name)', () => {
    expect(classifyField(raw('Company name')).kind).toBe('free-text');
  });
  it('"nom d\'utilisateur" → free-text (pas full-name)', () => {
    expect(classifyField(raw("Nom d'utilisateur")).kind).toBe('free-text');
  });
});

describe('classifyField — placeholder et TJM', () => {
  it('utilise le placeholder si label vide', () => {
    expect(classifyField(raw('', 'Votre TJM souhaité')).kind).toBe('tjm');
  });
  it('tarif journalier → tjm', () => {
    expect(classifyField(raw('Tarif journalier')).kind).toBe('tjm');
  });
});

describe('classifyField — cas vides/génériques', () => {
  it('label et placeholder vides → free-text', () => {
    expect(classifyField(raw('', '')).kind).toBe('free-text');
  });
  it('libellé inconnu → free-text', () => {
    expect(classifyField(raw('Quelque chose')).kind).toBe('free-text');
  });
});

describe('classifyField — conserve les métadonnées', () => {
  it('reporte label/placeholder/inputType/required', () => {
    const d = classifyField({
      label: 'Email pro',
      placeholder: 'vous@ex.fr',
      inputType: 'email',
      required: true,
    });
    expect(d).toMatchObject({
      label: 'Email pro',
      placeholder: 'vous@ex.fr',
      inputType: 'email',
      required: true,
      kind: 'email',
    });
  });
});
