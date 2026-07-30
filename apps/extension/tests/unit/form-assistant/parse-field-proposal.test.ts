import { describe, it, expect } from 'vitest';
import { parseFieldProposal } from '../../../src/lib/core/form-assistant/parse-field-proposal';

describe('parseFieldProposal', () => {
  it('retourne le texte trimé', () => {
    expect(parseFieldProposal('  Disponible immédiatement  ')).toEqual({
      text: 'Disponible immédiatement',
    });
  });
  it('retire les fences markdown', () => {
    const raw = '```\n550 € /jour\n```';
    expect(parseFieldProposal(raw)).toEqual({ text: '550 € /jour' });
  });
  it('retourne null pour une chaîne vide', () => {
    expect(parseFieldProposal('')).toBeNull();
  });
  it('retourne null pour des fences vides', () => {
    expect(parseFieldProposal('```\n```')).toBeNull();
  });
  it('retourne null pour du whitespace seul', () => {
    expect(parseFieldProposal('   \n  ')).toBeNull();
  });
  it('tronque les sorties trop longues', () => {
    const huge = 'x'.repeat(5000);
    const out = parseFieldProposal(huge);
    expect(out?.text.length).toBe(4000);
  });
  it('préserve le contenu multi-lignes (lettre de motivation)', () => {
    const raw = 'Bonjour,\n\nJe suis développeur.\nCordialement.';
    expect(parseFieldProposal(raw)?.text).toBe(raw);
  });
  it('rejette une sentinel "" (quotes vides)', () => {
    expect(parseFieldProposal('""')).toBeNull();
    expect(parseFieldProposal("''")).toBeNull();
    expect(parseFieldProposal('“”')).toBeNull();
  });
  it('débarrasse les quotes enveloppantes', () => {
    expect(parseFieldProposal('"Disponible immédiatement"')?.text).toBe('Disponible immédiatement');
    expect(parseFieldProposal('“550 €/jour”')?.text).toBe('550 €/jour');
  });
});
