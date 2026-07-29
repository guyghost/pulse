import { describe, it, expect } from 'vitest';
import { selectFormAssistEngine } from '../../../src/lib/core/form-assistant/select-engine';

describe('selectFormAssistEngine — table de vérité', () => {
  describe('chemin local', () => {
    it('préf local + available → local', () => {
      expect(selectFormAssistEngine('local', 'available', 'inactive', 'unknown')).toEqual({
        engine: 'local',
      });
    });
    it('préf local + after-download → none (local non prêt)', () => {
      expect(selectFormAssistEngine('local', 'after-download', 'active', 'granted')).toEqual({
        engine: 'none',
        reason: 'unavailable',
      });
    });
    it('préf local + no → none', () => {
      expect(selectFormAssistEngine('local', 'no', 'inactive', 'unknown')).toEqual({
        engine: 'none',
        reason: 'unavailable',
      });
    });
  });

  describe('chemin remote (Eve)', () => {
    it('préf remote + entitlement active + consent granted → remote', () => {
      expect(selectFormAssistEngine('remote', 'no', 'active', 'granted')).toEqual({
        engine: 'remote',
      });
    });
    it('préf remote mais consent denied → fallback local si available', () => {
      expect(selectFormAssistEngine('remote', 'available', 'active', 'denied')).toEqual({
        engine: 'local',
      });
    });
    it('préf remote mais entitlement inactif → fallback local si available', () => {
      expect(selectFormAssistEngine('remote', 'available', 'inactive', 'granted')).toEqual({
        engine: 'local',
      });
    });
    it('préf remote, rien de réuni, local absent → none', () => {
      expect(selectFormAssistEngine('remote', 'no', 'inactive', 'denied')).toEqual({
        engine: 'none',
        reason: 'unavailable',
      });
    });
  });

  describe('invariant LLM-ne-décide-pas', () => {
    it('retourne toujours une décision finie (jamais d’appel IA implicite)', () => {
      const matrix = (['local', 'remote'] as const).flatMap((pref) =>
        (['available', 'after-download', 'no'] as const).flatMap((avail) =>
          (['active', 'inactive'] as const).flatMap((ent) =>
            (['unknown', 'granted', 'denied'] as const).map(
              (cons) => [pref, avail, ent, cons] as const
            )
          )
        )
      );
      for (const [pref, avail, ent, cons] of matrix) {
        const out = selectFormAssistEngine(pref, avail, ent, cons);
        // La décision est une union finie, jamais une promesse ou un appel.
        expect(['local', 'remote', 'none']).toContain(out.engine);
      }
    });
  });
});
