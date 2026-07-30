import { describe, expect, it } from 'vitest';
import {
  decideModalTab,
  parseCanonicalModalScope,
  selectInitialFocusTarget,
  variantBelongsToSurface,
} from '../../../src/lib/core/modal-focus/focus-policy';

describe('modal focus policy', () => {
  it('accepts only the exact surface/variant relation', () => {
    expect(variantBelongsToSurface('backup_restore', 'backup_valid')).toBe(true);
    expect(variantBelongsToSurface('mission_comparison', 'comparison')).toBe(true);
    expect(variantBelongsToSurface('mission_investigation', 'comparison')).toBe(false);
    expect(variantBelongsToSurface('keyboard_shortcuts_help', 'backup_error')).toBe(false);
  });

  it('selects the model-owned ordered initial target', () => {
    const unavailable = {
      confirmationInputAvailable: false,
      closeButtonAvailable: false,
      cancelButtonAvailable: false,
      firstEnabledButtonAvailable: false,
      firstMissionLinkAvailable: false,
      firstEnabledActionAvailable: false,
      acknowledgementButtonAvailable: false,
    };
    expect(
      selectInitialFocusTarget('backup_valid', {
        ...unavailable,
        confirmationInputAvailable: true,
        firstEnabledButtonAvailable: true,
      })
    ).toBe('confirmation-input');
    expect(
      selectInitialFocusTarget('comparison', {
        ...unavailable,
        firstMissionLinkAvailable: true,
      })
    ).toBe('first-mission-link');
    expect(selectInitialFocusTarget('investigation', unavailable)).toBe('dialog');
  });

  it('wraps only at Tab boundaries and recovers focus entering from outside', () => {
    expect(
      decideModalTab({
        focusableCount: 3,
        activeIndex: 2,
        activeInsideDialog: true,
        shiftKey: false,
      })
    ).toEqual({ preventDefault: true, targetIndex: 0 });
    expect(
      decideModalTab({
        focusableCount: 3,
        activeIndex: 0,
        activeInsideDialog: true,
        shiftKey: true,
      })
    ).toEqual({ preventDefault: true, targetIndex: 2 });
    expect(
      decideModalTab({
        focusableCount: 3,
        activeIndex: 1,
        activeInsideDialog: true,
        shiftKey: false,
      })
    ).toEqual({ preventDefault: false, targetIndex: null });
    expect(
      decideModalTab({
        focusableCount: 3,
        activeIndex: -1,
        activeInsideDialog: false,
        shiftKey: false,
      })
    ).toEqual({ preventDefault: true, targetIndex: 0 });
  });

  it('normalizes a bounded owner scope and rejects ambiguous segments', () => {
    expect(parseCanonicalModalScope(['feed', 'mission_comparison'])).toEqual([
      'feed',
      'mission_comparison',
    ]);
    expect(Object.isFrozen(parseCanonicalModalScope(['feed']))).toBe(true);
    expect(parseCanonicalModalScope([])).toBeNull();
    expect(parseCanonicalModalScope([' feed child '])).toEqual(['feed child']);
    expect(parseCanonicalModalScope(['feed/child'])).toBeNull();
    expect(parseCanonicalModalScope(['feed\u200bchild'])).toBeNull();
    expect(parseCanonicalModalScope(Array.from({ length: 17 }, () => 'segment'))).toBeNull();
  });
});
