import { describe, it, expect } from 'vitest';
import { sanitizeFieldDescriptor } from '../../../src/lib/core/form-assistant/sanitize-field-descriptor';
import type { RawFieldInput } from '../../../src/lib/core/form-assistant/types';

function raw(over: Partial<RawFieldInput>): RawFieldInput {
  return {
    label: '',
    placeholder: '',
    inputType: 'text',
    required: false,
    ...over,
  };
}

describe('sanitizeFieldDescriptor — retire la PII accidentelle', () => {
  it('retire les URLs', () => {
    const d = sanitizeFieldDescriptor(raw({ label: 'Voir https://evil.example.com/x Prénom' }));
    expect(d.label).toBe('Voir Prénom');
    expect(d.kind).toBe('first-name');
  });
  it('retire les emails et reclassifie', () => {
    const d = sanitizeFieldDescriptor(raw({ label: 'Votre nom john@doe.com' }));
    expect(d.label).not.toContain('john@doe.com');
    expect(d.kind).toBe('full-name');
  });
  it('retire les numéros de téléphone', () => {
    const d = sanitizeFieldDescriptor(raw({ label: 'Tel +33 6 12 34 56 78 info' }));
    expect(d.label).not.toContain('+33');
  });
});

describe('sanitizeFieldDescriptor — normalise et plafonne', () => {
  it('colle les espaces multiples', () => {
    const d = sanitizeFieldDescriptor(raw({ label: 'Prénom    du   candidat' }));
    expect(d.label).toBe('Prénom du candidat');
  });
  it('plafonne la longueur du label', () => {
    const long = 'Prénom ' + 'x'.repeat(200);
    const d = sanitizeFieldDescriptor(raw({ label: long }));
    expect(d.label.length).toBeLessThanOrEqual(120);
  });
  it('plafonne la longueur du placeholder', () => {
    const long = 'x'.repeat(300);
    const d = sanitizeFieldDescriptor(raw({ placeholder: long }));
    expect(d.placeholder.length).toBeLessThanOrEqual(200);
  });
});

describe('sanitizeFieldDescriptor — reclassifie après nettoyage', () => {
  it('classifie tjm après retrait PII', () => {
    const d = sanitizeFieldDescriptor(raw({ label: 'TJM https://x.com/y' }));
    expect(d.kind).toBe('tjm');
    expect(d.label).not.toContain('http');
  });
});

describe('sanitizeFieldDescriptor — immutabilité / pureté', () => {
  it('ne modifie pas l’entrée', () => {
    const input = raw({ label: 'Prénom john@doe.com', placeholder: 'p' });
    const snapshot = { ...input };
    sanitizeFieldDescriptor(input);
    expect(input).toEqual(snapshot);
  });
});
