import { describe, expect, it, vi } from 'vitest';
import type { Experience } from '../../../src/lib/core/types/profile';
import {
  createNativeToggleActivationPort,
  createCvExperienceCardAccessibilityActor,
  createDetailsIdLeaseRegistry,
  createExperienceCardInput,
  decodeExperienceCardInputChange,
  decodeExperienceCardInputEvent,
  decodeExperienceCardMachineEvent,
  getExperienceCardSignature,
  haveParentCallbackSettlementsCompleted,
  projectExperienceAccessibility,
  validateExperienceSavePayload,
  type DetailsIdLeaseRegistry,
  type ExperienceCardInput,
} from '../../../src/models/cv-experience-card-accessibility.machine';

const scope = {};

function experience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: 'exp-1',
    title: 'Lead Packaged UI',
    company: 'MissionPulse QA',
    employmentType: 'Freelance',
    location: 'Lyon',
    startDate: '2025-01',
    endDate: null,
    isCurrent: true,
    description: 'Preuve CV locale dans Chrome MV3.',
    skills: ['Svelte', 'TypeScript', 'Playwright'],
    source: 'manual',
    sourceExternalId: null,
    positionIndex: 0,
    updatedAt: 42,
    ...overrides,
  };
}

function input(overrides: Partial<ExperienceCardInput> = {}): ExperienceCardInput {
  return createExperienceCardInput({
    experience: experience(),
    isEditing: false,
    isBusy: false,
    draft: null,
    ...overrides,
  });
}

function start(
  value: ExperienceCardInput = input(),
  options: {
    instanceSuffix?: string;
    registry?: DetailsIdLeaseRegistry;
    scope?: object;
    onDiagnostic?: (code: string) => void;
  } = {}
) {
  const actor = createCvExperienceCardAccessibilityActor({
    input: value,
    instanceSuffix: options.instanceSuffix ?? 'c1',
    registry: options.registry ?? createDetailsIdLeaseRegistry(),
    scope: options.scope ?? scope,
    onDiagnostic: options.onDiagnostic,
  });
  actor.start();
  return actor;
}

function sendInput(
  actor: ReturnType<typeof start>,
  next: ExperienceCardInput,
  focusedControl: Parameters<typeof decodeExperienceCardInputEvent>[2]
): void {
  const event = decodeExperienceCardInputEvent(
    actor.getSnapshot().context.input,
    next,
    focusedControl
  );
  expect(event).not.toBeNull();
  if (event !== null) {
    actor.send(event);
  }
}

async function flushSettlements(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('CV experience card accessibility machine — revision 6', () => {
  it('01 projects the exact packaged A3 accessible contract', () => {
    const projection = projectExperienceAccessibility(experience(), false);
    expect(projection).toMatchObject({
      cardName: 'Expérience Lead Packaged UI chez MissionPulse QA',
      toggleName: 'Afficher les détails de l’expérience Lead Packaged UI',
      regionName: 'Détails de l’expérience Lead Packaged UI',
      normalizedSkills: ['Svelte', 'TypeScript', 'Playwright'],
      hasDetails: true,
    });
  });

  it('02 toggles only between collapsed and expanded', () => {
    const actor = start();
    expect(actor.getSnapshot().matches({ display: 'collapsed' })).toBe(true);
    actor.send({ type: 'TOGGLE_REQUESTED', owner: 'c1', source: 'pointer' });
    expect(actor.getSnapshot().matches({ display: 'expanded' })).toBe(true);
    actor.send({ type: 'TOGGLE_REQUESTED', owner: 'c1', source: 'pointer' });
    expect(actor.getSnapshot().matches({ display: 'collapsed' })).toBe(true);
  });

  it('03 accepts pointer, Enter and Space as exactly one owner transition each', () => {
    const dispatchedSources: Array<'pointer' | 'Enter' | 'Space'> = [];
    const activationPort = createNativeToggleActivationPort((source) => {
      dispatchedSources.push(source);
    });
    activationPort.click(1);
    activationPort.keydown('Enter');
    activationPort.click(0);
    activationPort.keydown(' ');
    activationPort.click(0);
    expect(dispatchedSources).toEqual(['pointer', 'Enter', 'Space']);

    const onDiagnostic = vi.fn();
    const actor = start(input(), { onDiagnostic });
    for (const source of ['pointer', 'Enter', 'Space'] as const) {
      const before = actor.getSnapshot().value;
      actor.send({ type: 'TOGGLE_REQUESTED', owner: 'c1', source });
      expect(actor.getSnapshot().value).not.toEqual(before);
    }
    const beforeForeignToggle = actor.getSnapshot();
    actor.send({ type: 'TOGGLE_REQUESTED', owner: 'foreign', source: 'Enter' });
    expect(actor.getSnapshot().value).toStrictEqual(beforeForeignToggle.value);
    expect(actor.getSnapshot().context).toBe(beforeForeignToggle.context);
    expect(onDiagnostic).not.toHaveBeenCalled();
  });

  it('04 reserves distinct bounded ASCII details IDs', () => {
    const registry = createDetailsIdLeaseRegistry();
    const first = start(input(), { instanceSuffix: 'c1', registry });
    const second = start(input({ experience: experience({ id: 'exp-2' }) }), {
      instanceSuffix: 'c2',
      registry,
    });
    for (const id of [
      first.getSnapshot().context.detailsId,
      second.getSnapshot().context.detailsId,
    ]) {
      expect(id).toMatch(/^cv-experience-details-[A-Za-z][A-Za-z0-9-]{0,63}$/);
      expect(id.length).toBeGreaterThanOrEqual(23);
      expect(id.length).toBeLessThanOrEqual(86);
    }
    expect(first.getSnapshot().context.detailsId).not.toBe(second.getSnapshot().context.detailsId);
  });

  it('05 fails closed for invalid suffixes and collisions without sanitizing', () => {
    const invalid = start(input(), { instanceSuffix: '_é' });
    expect(invalid.getSnapshot().matches('unavailable')).toBe(true);
    expect(invalid.getSnapshot().context.unavailableReason).toBe('invalid_details_id');

    const registry = createDetailsIdLeaseRegistry();
    const winner = start(input(), { instanceSuffix: 'c9', registry });
    const loser = start(input({ experience: experience({ id: 'exp-2' }) }), {
      instanceSuffix: 'c9',
      registry,
    });
    expect(winner.getSnapshot().matches({ display: 'collapsed' })).toBe(true);
    expect(loser.getSnapshot().context.unavailableReason).toBe('details_id_collision');
    expect(loser.getSnapshot().context.diagnostics).toHaveLength(1);
  });

  it('05b records and reports each identity rejection exactly once', () => {
    const invalidReports: string[] = [];
    const invalid = start(input(), {
      instanceSuffix: '_é',
      onDiagnostic: (code) => invalidReports.push(code),
    });
    expect(invalidReports).toEqual(['INVALID_DETAILS_ID']);
    expect(invalid.getSnapshot().context.identityDiagnostic).toEqual({
      detailsId: 'cv-experience-details-_é',
      reason: 'INVALID_DETAILS_ID',
      diagnosticKey: 'INVALID_DETAILS_ID:24:cv-experience-details-_é:2:_é',
      reported: true,
    });

    invalid.send({ type: 'COMPONENT_DESTROYED', ownsFocus: false });
    expect(invalidReports).toEqual(['INVALID_DETAILS_ID']);

    const registry = createDetailsIdLeaseRegistry();
    start(input(), { instanceSuffix: 'c9', registry });
    const collisionReports: string[] = [];
    const collision = start(input({ experience: experience({ id: 'exp-2' }) }), {
      instanceSuffix: 'c9',
      registry,
      onDiagnostic: (code) => collisionReports.push(code),
    });
    expect(collisionReports).toEqual(['DETAILS_ID_COLLISION']);
    expect(collision.getSnapshot().context.identityDiagnostic).toMatchObject({
      detailsId: 'cv-experience-details-c9',
      reason: 'DETAILS_ID_COLLISION',
      reported: true,
    });
  });

  it('06 trims whitespace fallbacks and makes no-details unavailable', () => {
    const value = experience({
      title: '  ',
      company: ' \t ',
      description: ' \n ',
      skills: [' ', '\t'],
    });
    const projection = projectExperienceAccessibility(value, false);
    expect(projection.cardName).toBe('Expérience Sans titre chez Entreprise inconnue');
    expect(projection.hasDetails).toBe(false);
    const actor = start(input({ experience: value }));
    expect(actor.getSnapshot().context.unavailableReason).toBe('no_details');
  });

  it('07 rejects editing without a same-owner draft', () => {
    const missing = start(input({ isEditing: true, draft: null }));
    expect(missing.getSnapshot().context.unavailableReason).toBe('invalid_edit_input');
    const wrong = start(input({ isEditing: true, draft: experience({ id: 'different' }) }));
    expect(wrong.getSnapshot().context.unavailableReason).toBe('draft_owner_mismatch');
  });

  it('07b reports each initial invalid-edit classification once', () => {
    for (const [value, expected] of [
      [input({ isEditing: true, draft: null }), 'INVALID_EDIT_INPUT'],
      [input({ isEditing: true, draft: experience({ id: 'different' }) }), 'DRAFT_OWNER_MISMATCH'],
    ] as const) {
      const reports: string[] = [];
      const actor = start(value, { onDiagnostic: (code) => reports.push(code) });
      expect(reports).toEqual([expected]);
      actor.send({ type: 'COMPONENT_DESTROYED', ownsFocus: false });
      expect(reports).toEqual([expected]);
    }
  });

  it('07c reports the current invalid-edit classification again after an accepted capability change', () => {
    for (const [value, next, expected] of [
      [
        input({ isEditing: true, draft: null, isBusy: false }),
        input({ isEditing: true, draft: null, isBusy: true }),
        'INVALID_EDIT_INPUT',
      ],
      [
        input({
          isEditing: true,
          draft: experience({ id: 'different' }),
          isBusy: false,
        }),
        input({
          isEditing: true,
          draft: experience({ id: 'different' }),
          isBusy: true,
        }),
        'DRAFT_OWNER_MISMATCH',
      ],
    ] as const) {
      const onDiagnostic = vi.fn();
      const actor = start(value, { onDiagnostic });
      expect(onDiagnostic).toHaveBeenCalledTimes(1);
      expect(onDiagnostic).toHaveBeenLastCalledWith(expected);

      sendInput(actor, next, 'article');

      expect(actor.getSnapshot().matches('unavailable')).toBe(true);
      expect(actor.getSnapshot().context.unavailableReason).toBe(
        expected === 'INVALID_EDIT_INPUT' ? 'invalid_edit_input' : 'draft_owner_mismatch'
      );
      expect(onDiagnostic).toHaveBeenCalledTimes(2);
      expect(onDiagnostic).toHaveBeenLastCalledWith(expected);
    }
  });

  it('07d does not re-report invalid-edit classification for presentation or callback-reference changes', () => {
    const firstEdit = vi.fn();
    const secondEdit = vi.fn();
    const onDiagnostic = vi.fn();
    const initial = input({ isEditing: true, draft: null, onEdit: firstEdit });
    const actor = start(initial, { onDiagnostic });
    expect(onDiagnostic).toHaveBeenCalledTimes(1);

    sendInput(actor, input({ isEditing: true, draft: null, onEdit: secondEdit }), 'article');
    expect(actor.getSnapshot().context.lastDerivedInputEvent).toBe('CALLBACK_REFERENCE_CHANGED');
    expect(onDiagnostic).toHaveBeenCalledTimes(1);

    sendInput(
      actor,
      input({
        experience: experience({ employmentType: 'CDI' }),
        isEditing: true,
        draft: null,
        onEdit: secondEdit,
      }),
      'article'
    );
    expect(actor.getSnapshot().context.lastDerivedInputEvent).toBe(
      'EXPERIENCE_PRESENTATION_CHANGED'
    );
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
  });

  it('08 edit entry removes expanded state and requests title focus', () => {
    const actor = start();
    actor.send({ type: 'TOGGLE_REQUESTED', owner: 'c1', source: 'pointer' });
    sendInput(actor, input({ isEditing: true, draft: experience() }), 'edit');
    expect(actor.getSnapshot().matches('editing')).toBe(true);
    expect(actor.getSnapshot().context.focusRequest?.target).toBe('title');
  });

  it('09 changed and unchanged edit exits are exclusive and collapsed', () => {
    for (const nextExperience of [experience(), experience({ title: 'Changed' })]) {
      const actor = start(input({ isEditing: true, draft: experience() }));
      sendInput(
        actor,
        input({ experience: nextExperience, isEditing: false, draft: null }),
        'cancel'
      );
      expect(actor.getSnapshot().matches({ display: 'collapsed' })).toBe(true);
      expect(actor.getSnapshot().context.focusRequest?.target).toBe('article');
      expect(actor.getSnapshot().context.lastDerivedInputEvent).toBe(
        nextExperience.title === 'Changed' ? 'EDIT_EXITED_CHANGED' : 'EDIT_EXITED_UNCHANGED'
      );
    }
  });

  it('10 handles every true-to-true replacement and invalid recovery', () => {
    const actor = start(input({ isEditing: true, draft: null }));
    sendInput(actor, input({ isEditing: true, draft: experience() }), 'article');
    expect(actor.getSnapshot().matches('editing')).toBe(true);
    expect(actor.getSnapshot().context.focusRequest?.target).toBe('title');
    const replacement = experience({ id: 'exp-2', title: 'Replacement' });
    sendInput(
      actor,
      input({ experience: replacement, isEditing: true, draft: replacement }),
      'title'
    );
    expect(actor.getSnapshot().matches('editing')).toBe(true);
    expect(actor.getSnapshot().context.input.experience.id).toBe('exp-2');
  });

  it('11 snapshots immutable inputs and compares the complete signature', () => {
    const source = experience();
    const value = input({ experience: source });
    source.skills.push('Mutation');
    expect(value.experience.skills).toEqual(['Svelte', 'TypeScript', 'Playwright']);
    expect(Object.isFrozen(value.experience)).toBe(true);
    expect(Object.isFrozen(value.experience.skills)).toBe(true);
    expect(getExperienceCardSignature(value)).toHaveLength(13);
  });

  it('12 replacement closes expanded details while retaining the mounted ID', () => {
    const actor = start();
    const id = actor.getSnapshot().context.detailsId;
    actor.send({ type: 'TOGGLE_REQUESTED', owner: 'c1', source: 'pointer' });
    sendInput(actor, input({ experience: experience({ description: 'Changed' }) }), 'toggle');
    expect(actor.getSnapshot().matches({ display: 'collapsed' })).toBe(true);
    expect(actor.getSnapshot().context.detailsId).toBe(id);
  });

  it('13 transfers no-details edit/delete callbacks without toggling', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const actor = start(
      input({
        experience: experience({ description: '', skills: [] }),
        onEdit,
        onDelete,
      })
    );
    actor.send({ type: 'EDIT_REQUESTED' });
    actor.send({ type: 'DELETE_REQUESTED' });
    await flushSettlements();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(actor.getSnapshot().matches('unavailable')).toBe(true);
  });

  it('14 makes stale, busy and missing-handler UI intents exact no-ops', () => {
    const callback = vi.fn();
    const onDiagnostic = vi.fn();
    const actor = start(
      input({
        isBusy: true,
        onEdit: callback,
        onDelete: callback,
        onSave: callback,
        onCancelEdit: callback,
      }),
      { onDiagnostic }
    );
    const before = actor.getSnapshot();

    actor.send({ type: 'EDIT_REQUESTED' });
    actor.send({ type: 'DELETE_REQUESTED' });
    actor.send({ type: 'EDIT_SAVE_REQUESTED', payload: {} });
    actor.send({ type: 'EDIT_CANCEL_REQUESTED' });

    expect(actor.getSnapshot().value).toStrictEqual(before.value);
    expect(actor.getSnapshot().context).toBe(before.context);
    expect(callback).not.toHaveBeenCalled();
    expect(onDiagnostic).not.toHaveBeenCalled();

    const missingHandler = start();
    const beforeMissing = missingHandler.getSnapshot();
    missingHandler.send({ type: 'EDIT_REQUESTED' });
    expect(missingHandler.getSnapshot().value).toStrictEqual(beforeMissing.value);
    expect(missingHandler.getSnapshot().context).toBe(beforeMissing.context);

    for (const editing of [
      start(
        input({
          isEditing: true,
          draft: experience(),
          isBusy: true,
          onSave: callback,
          onCancelEdit: callback,
        })
      ),
      start(input({ isEditing: true, draft: experience() })),
    ]) {
      const beforeEditingRejection = editing.getSnapshot();
      editing.send({ type: 'EDIT_SAVE_REQUESTED', payload: {} });
      editing.send({ type: 'EDIT_CANCEL_REQUESTED' });
      expect(editing.getSnapshot().value).toStrictEqual(beforeEditingRejection.value);
      expect(editing.getSnapshot().context).toBe(beforeEditingRejection.context);
    }
    expect(callback).not.toHaveBeenCalled();
  });

  it('14b rejects unknown runtime events through the closed protocol', () => {
    const onDiagnostic = vi.fn();
    const actor = start(input(), { onDiagnostic });
    const before = actor.getSnapshot();
    actor.send({ type: 'UNKNOWN_RUNTIME_EVENT' } as never);
    expect(actor.getSnapshot().value).toStrictEqual(before.value);
    expect(actor.getSnapshot().context).toBe(before.context);
    expect(onDiagnostic).not.toHaveBeenCalled();
  });

  it('14c rejects malformed known events and overlong input tuples before transition', () => {
    const validInputEvent = decodeExperienceCardInputEvent(
      input(),
      input({ experience: experience({ title: 'Next' }) }),
      'article'
    );
    expect(validInputEvent?.type).toBe('EXPERIENCE_INPUT_CHANGED');
    if (validInputEvent?.type !== 'EXPERIENCE_INPUT_CHANGED') {
      return;
    }
    const invalidEvents = [
      { type: 'TOGGLE_REQUESTED', owner: 'c1', source: 'bogus' },
      { type: 'COMPONENT_DESTROYED', ownsFocus: 'yes' },
      { type: 'PARENT_CALLBACK_FULFILLED', invocationId: 0, intentKind: 'edit' },
      { ...validInputEvent, previous: [...validInputEvent.previous, true] },
      { ...validInputEvent, focusedControl: 'unknown-control' },
      { ...validInputEvent, unexpected: true },
    ];
    for (const event of invalidEvents) {
      expect(decodeExperienceCardMachineEvent(event)).toBeNull();
    }

    const onDiagnostic = vi.fn();
    const actor = start(input(), { onDiagnostic });
    const before = actor.getSnapshot();
    actor.send(invalidEvents[0] as never);
    expect(actor.getSnapshot().value).toStrictEqual(before.value);
    expect(actor.getSnapshot().context).toBe(before.context);
    expect(onDiagnostic).not.toHaveBeenCalled();
  });

  it('14d decodes a mutable event freshly for every reception', () => {
    const actor = start();
    const event: {
      type: 'TOGGLE_REQUESTED';
      owner: string;
      source: string;
    } = { type: 'TOGGLE_REQUESTED', owner: 'c1', source: 'pointer' };

    actor.send(event as never);
    expect(actor.getSnapshot().matches({ display: 'expanded' })).toBe(true);

    const beforeRejectedReception = actor.getSnapshot();
    event.owner = 'foreign';
    event.source = 'bogus';
    actor.send(event as never);

    expect(actor.getSnapshot().value).toStrictEqual(beforeRejectedReception.value);
    expect(actor.getSnapshot().context).toBe(beforeRejectedReception.context);
  });

  it('14e owns one decoded snapshot across every guard and action in a reception', () => {
    const actor = start();
    const declared = experience({ id: 'exp-2', title: 'Declared replacement' });
    const divergent = experience({ id: 'exp-3', title: 'Divergent replacement' });
    const event = decodeExperienceCardInputEvent(
      actor.getSnapshot().context.input,
      input({ experience: declared }),
      'article'
    );
    expect(event?.type).toBe('EXPERIENCE_INPUT_CHANGED');
    if (event?.type !== 'EXPERIENCE_INPUT_CHANGED') {
      return;
    }

    let reads = 0;
    const statefulEvent = new Proxy(
      { ...event },
      {
        getOwnPropertyDescriptor(target, property) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
          if (property !== 'nextExperience' || descriptor === undefined) {
            return descriptor;
          }
          reads += 1;
          return { ...descriptor, value: reads <= 3 ? declared : divergent };
        },
      }
    );

    actor.send(statefulEvent as never);

    expect(reads).toBe(1);
    expect(actor.getSnapshot().context.input.experience.id).toBe('exp-2');
    expect(actor.getSnapshot().context.input.experience.title).toBe('Declared replacement');
  });

  it('14f reads the event type descriptor exactly once at the strict decoder boundary', () => {
    let typeReads = 0;
    const event = new Proxy(
      { type: 'EDIT_REQUESTED' },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'type') {
            typeReads += 1;
            return {
              configurable: true,
              enumerable: true,
              value: typeReads === 1 ? 'EDIT_REQUESTED' : 'DELETE_REQUESTED',
              writable: true,
            };
          }
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      }
    );

    expect(decodeExperienceCardMachineEvent(event)).toEqual({ type: 'EDIT_REQUESTED' });
    expect(typeReads).toBe(1);
  });

  it('15 commits expansion semantics in one machine transition', () => {
    const actor = start();
    actor.send({ type: 'TOGGLE_REQUESTED', owner: 'c1', source: 'pointer' });
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches({ display: 'expanded' })).toBe(true);
    expect(snapshot.context.projection.toggleName).toMatch(/^Masquer/);
  });

  it('16 delegates focused destruction through the exact synchronous parent port', () => {
    const onFocusExitRequest = vi.fn(() => 'next_experience_article' as const);
    const actor = start(input({ onFocusExitRequest }));
    actor.send({ type: 'COMPONENT_DESTROYED', ownsFocus: true });
    expect(onFocusExitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        experienceId: 'exp-1',
        orderedTargets: [
          'next_experience_article',
          'previous_experience_article',
          'add_experience_button',
          'cv_heading',
        ],
      })
    );
    expect(actor.getSnapshot().matches('terminal')).toBe(true);
  });

  it('17 ignores every late event in terminal', () => {
    const actor = start();
    actor.send({ type: 'COMPONENT_DESTROYED', ownsFocus: false });
    const terminal = actor.getSnapshot().context;
    actor.send({ type: 'TOGGLE_REQUESTED', owner: 'c1', source: 'Space' });
    actor.send({ type: 'EDIT_REQUESTED' });
    actor.send({ type: 'PARENT_CALLBACK_FULFILLED', invocationId: 999, intentKind: 'edit' });
    expect(actor.getSnapshot().matches('terminal')).toBe(true);
    expect(actor.getSnapshot().context).toBe(terminal);
  });

  it('18 decodes callback availability/busy and delegates disabled-control focus', () => {
    const onEdit = vi.fn();
    const before = input({ onEdit, isBusy: false });
    const after = input({ onEdit, isBusy: true });
    expect(decodeExperienceCardInputChange(before, after).kind).toBe('capability');
    const actor = start(before);
    sendInput(actor, after, 'edit');
    expect(actor.getSnapshot().matches({ display: 'collapsed' })).toBe(true);
    expect(actor.getSnapshot().context.focusRequest?.target).toBe('article');
  });

  it('18b reconciles focused controls when semantic and capability inputs change together', () => {
    const onEdit = vi.fn();
    const display = start(input({ onEdit }));
    sendInput(
      display,
      input({ experience: experience({ description: 'Updated' }), onEdit: undefined }),
      'edit'
    );
    expect(display.getSnapshot().context.focusRequest?.target).toBe('article');

    const onSave = vi.fn();
    const currentDraft = experience();
    const editing = start(input({ isEditing: true, draft: currentDraft, onSave }));
    const updatedDraft = experience({ description: 'Updated draft' });
    sendInput(
      editing,
      input({
        experience: updatedDraft,
        isEditing: true,
        draft: updatedDraft,
        onSave: undefined,
      }),
      'save'
    );
    expect(editing.getSnapshot().context.focusRequest?.target).toBe('title');

    const external = start();
    sendInput(
      external,
      input({ experience: experience({ title: 'External replacement' }) }),
      'other'
    );
    expect(external.getSnapshot().context.focusRequest).toBeNull();
  });

  it('19 detects callback reference replacement with an otherwise equal signature', () => {
    const first = vi.fn();
    const second = vi.fn();
    const before = input({ onEdit: first });
    const after = input({ onEdit: second });
    expect(getExperienceCardSignature(before)).toEqual(getExperienceCardSignature(after));
    expect(decodeExperienceCardInputChange(before, after).kind).toBe('callback_reference');
  });

  it('20 validates, explicitly merges and freezes a save candidate', () => {
    const draft = experience();
    const result = validateExperienceSavePayload(
      {
        title: ' Staff Engineer ',
        company: ' Pulse ',
        employmentType: ' CDI ',
        location: ' Paris ',
        startDate: '2024-02',
        endDate: '2025-03',
        isCurrent: false,
        description: ' Description ',
        skills: [' Svelte ', '', 'Svelte'],
      },
      draft
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({
      id: draft.id,
      title: 'Staff Engineer',
      company: 'Pulse',
      source: draft.source,
      sourceExternalId: draft.sourceExternalId,
      positionIndex: draft.positionIndex,
      updatedAt: draft.updatedAt,
      skills: ['Svelte', 'Svelte'],
    });
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.skills)).toBe(true);
  });

  it('21 rejects hostile save payload shapes and focuses current-role contradiction safely', () => {
    const base = {
      title: 'Lead',
      company: 'Pulse',
      employmentType: '',
      location: '',
      startDate: '2024-01',
      endDate: null,
      isCurrent: true,
      description: '',
      skills: [],
    };
    const wrongPrototype = Object.assign(Object.create(null) as Record<string, unknown>, base);
    const withSymbol = { ...base, [Symbol('x')]: true };
    const withAccessor = { ...base };
    Object.defineProperty(withAccessor, 'title', { get: () => 'Lead', enumerable: true });
    const nonEnumerable = { ...base };
    Object.defineProperty(nonEnumerable, 'title', { value: 'Lead', enumerable: false });
    const hostileProxy = new Proxy(base, {
      ownKeys() {
        throw new Error('hostile');
      },
    });
    for (const payload of [wrongPrototype, withSymbol, withAccessor, nonEnumerable, hostileProxy]) {
      expect(validateExperienceSavePayload(payload, experience()).ok).toBe(false);
    }
    const iteratorBypass: unknown[] = [{ not: 'a string' }];
    Object.defineProperty(iteratorBypass, Symbol.iterator, {
      value: function* () {
        yield 'injected';
      },
    });
    expect(
      validateExperienceSavePayload({ ...base, skills: iteratorBypass }, experience())
    ).toMatchObject({
      ok: false,
      focusTarget: 'article',
      diagnostic: { field: 'skills', reason: 'invalid_type' },
    });
    const onSave = vi.fn();
    const editing = start(input({ isEditing: true, draft: experience(), onSave }));
    editing.send({ type: 'EDIT_SAVE_REQUESTED', payload: { ...base, skills: iteratorBypass } });
    expect(editing.getSnapshot().matches('editing')).toBe(true);
    expect(editing.getSnapshot().context.focusRequest?.target).toBe('article');
    expect(onSave).not.toHaveBeenCalled();
    const throwingSkills = new Proxy<string[]>([], {
      ownKeys() {
        throw new Error('skills inspection failed');
      },
    });
    expect(
      validateExperienceSavePayload({ ...base, skills: throwingSkills }, experience())
    ).toMatchObject({
      ok: false,
      focusTarget: 'article',
      diagnostic: { field: 'payload', reason: 'inspection_failed' },
    });
    expect(
      validateExperienceSavePayload({ ...base, isCurrent: 'yes' }, experience())
    ).toMatchObject({
      ok: false,
      focusTarget: 'article',
      diagnostic: { field: 'isCurrent', reason: 'invalid_type' },
    });
    const contradiction = validateExperienceSavePayload(
      { ...base, endDate: '2025-01' },
      experience()
    );
    expect(contradiction).toMatchObject({
      ok: false,
      focusTarget: 'current',
      diagnostic: { reason: 'current_requires_null' },
    });
  });

  it('21b validates and copies a stateful save payload exactly once', () => {
    const onSave = vi.fn();
    const draft = experience();
    const actor = start(input({ isEditing: true, draft, onSave }));
    let inspections = 0;
    const payload = new Proxy(
      {
        title: 'Lead',
        company: 'Pulse',
        employmentType: '',
        location: '',
        startDate: '2024-01',
        endDate: null,
        isCurrent: true,
        description: '',
        skills: [],
      },
      {
        getPrototypeOf(target) {
          inspections += 1;
          if (inspections > 1) {
            throw new Error('second inspection');
          }
          return Reflect.getPrototypeOf(target);
        },
      }
    );

    actor.send({ type: 'EDIT_SAVE_REQUESTED', payload });

    expect(inspections).toBe(1);
    expect(onSave).toHaveBeenCalledOnce();
    expect(actor.getSnapshot().context.diagnostics.at(-1)?.code).not.toBe('INVALID_SAVE_PAYLOAD');
  });

  it('22 confines void, throws, reject, hostile then and multi-settlement without false success', async () => {
    const callbacks: Array<() => unknown> = [
      () => undefined,
      () => {
        throw new Error('sync');
      },
      () => Promise.reject(new Error('async')),
      () => ({
        get then() {
          throw new Error('getter');
        },
      }),
      () => ({
        then(resolve: (value: undefined) => void, reject: (reason: Error) => void) {
          resolve(undefined);
          reject(new Error('late'));
          resolve(undefined);
        },
      }),
    ];
    for (const callback of callbacks) {
      const actor = start(input({ onEdit: callback }));
      actor.send({ type: 'EDIT_REQUESTED' });
      await flushSettlements();
      expect(actor.getSnapshot().context.settlementRecords.size).toBe(1);
      expect(actor.getSnapshot().matches({ display: 'collapsed' })).toBe(true);
    }
  });

  it('23 accepts only the internally recorded exact settlement', async () => {
    let resolve!: () => void;
    const actor = start(
      input({
        onEdit: () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      })
    );
    actor.send({ type: 'EDIT_REQUESTED' });
    expect(actor.getSnapshot().context.settlementRecords.size).toBe(0);
    const beforeUnknownSettlement = actor.getSnapshot();
    actor.send({ type: 'PARENT_CALLBACK_FULFILLED', invocationId: 1, intentKind: 'edit' });
    expect(actor.getSnapshot().value).toStrictEqual(beforeUnknownSettlement.value);
    expect(actor.getSnapshot().context).toBe(beforeUnknownSettlement.context);
    expect(actor.getSnapshot().context.settlementRecords.size).toBe(0);

    resolve();
    await flushSettlements();
    const record = actor.getSnapshot().context.settlementRecords.get(1);
    expect(record?.outcome).toBe('fulfilled');
    expect(record?.consumed).toBe(true);
    const diagnosticCount = actor.getSnapshot().context.settlementDiagnostics.size;
    const beforeStaleSettlements = actor.getSnapshot();
    actor.send({ type: 'PARENT_CALLBACK_FULFILLED', invocationId: 1, intentKind: 'edit' });
    actor.send({
      type: 'PARENT_CALLBACK_FAILED',
      invocationId: 1,
      intentKind: 'edit',
      failureKind: 'reject',
    });
    actor.send({
      type: 'PARENT_CALLBACK_FAILED',
      invocationId: 999,
      intentKind: 'edit',
      failureKind: 'reject',
    });
    expect(actor.getSnapshot().value).toStrictEqual(beforeStaleSettlements.value);
    expect(actor.getSnapshot().context).toBe(beforeStaleSettlements.context);
    expect(actor.getSnapshot().context.settlementDiagnostics.size).toBe(diagnosticCount);
    expect(actor.getSnapshot().context.settlementRecords.get(1)?.consumed).toBe(true);
  });

  it('23b records settlement authority in machine context before publishing it', async () => {
    let resolve!: () => void;
    const actor = start(
      input({
        onEdit: () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      })
    );
    actor.send({ type: 'EDIT_REQUESTED' });

    resolve();
    await Promise.resolve();

    expect(actor.getSnapshot().context.settledInvocationIds).toEqual(new Set([1]));
    expect(actor.getSnapshot().context.settlementRecords.get(1)).toEqual({
      invocationId: 1,
      intentKind: 'edit',
      outcome: 'fulfilled',
      consumed: false,
    });

    await flushSettlements();
    expect(actor.getSnapshot().context.settlementRecords.get(1)?.consumed).toBe(true);
  });

  it('23c records and consumes a callback that settles after destruction', async () => {
    let resolve!: () => void;
    const actor = start(
      input({
        onDelete: () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      })
    );
    actor.send({ type: 'DELETE_REQUESTED' });
    actor.send({ type: 'COMPONENT_DESTROYED', ownsFocus: false });
    expect(actor.getSnapshot().matches('terminal')).toBe(true);

    resolve();
    await flushSettlements();

    expect(actor.getSnapshot().matches('terminal')).toBe(true);
    expect(actor.getSnapshot().context.settledInvocationIds).toEqual(new Set([1]));
    expect(actor.getSnapshot().context.settlementRecords.get(1)).toMatchObject({
      invocationId: 1,
      intentKind: 'delete',
      outcome: 'fulfilled',
      consumed: true,
    });
    expect(haveParentCallbackSettlementsCompleted(actor.getSnapshot().context)).toBe(true);
  });

  it('23d keeps terminal actor cleanup pending until every invocation is consumed', async () => {
    let resolve!: () => void;
    const actor = start(
      input({
        onEdit: () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      })
    );
    actor.send({ type: 'EDIT_REQUESTED' });
    actor.send({ type: 'COMPONENT_DESTROYED', ownsFocus: false });
    expect(haveParentCallbackSettlementsCompleted(actor.getSnapshot().context)).toBe(false);

    resolve();
    await flushSettlements();

    expect(haveParentCallbackSettlementsCompleted(actor.getSnapshot().context)).toBe(true);
  });

  it('24 reserves idempotently, preserves collision winner and releases only its owner', () => {
    const registry = createDetailsIdLeaseRegistry();
    const localScope = {};
    const firstOwner = {};
    const otherOwner = {};
    const id = 'cv-experience-details-c1';
    expect(registry.reserve(localScope, id, firstOwner)).toBe('reserved');
    expect(registry.reserve(localScope, id, firstOwner)).toBe('owned');
    expect(registry.reserve(localScope, id, otherOwner)).toBe('collision');
    expect(registry.release(localScope, id, otherOwner)).toBe('mismatch');
    expect(registry.reserve(localScope, id, otherOwner)).toBe('collision');
    expect(registry.release(localScope, id, firstOwner)).toBe('released');
    expect(registry.reserve(localScope, id, otherOwner)).toBe('reserved');
  });

  it('25 decodes focus-exit availability/reference and uses only the latest reference', () => {
    const first = vi.fn(() => 'cv_heading' as const);
    const second = vi.fn(() => 'add_experience_button' as const);
    const actor = start(input({ onFocusExitRequest: first }));
    const next = input({ onFocusExitRequest: second });
    expect(decodeExperienceCardInputChange(actor.getSnapshot().context.input, next).kind).toBe(
      'callback_reference'
    );
    sendInput(actor, next, 'other');
    actor.send({ type: 'COMPONENT_DESTROYED', ownsFocus: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('26 confines absent, throwing and null focus ports while releasing and terminating', () => {
    for (const onFocusExitRequest of [
      undefined,
      () => {
        throw new Error('focus');
      },
      () => null,
    ]) {
      const actor = start(input({ onFocusExitRequest }));
      actor.send({ type: 'COMPONENT_DESTROYED', ownsFocus: true });
      expect(actor.getSnapshot().matches('terminal')).toBe(true);
      expect(actor.getSnapshot().context.identityLease).toBe('released');
    }
  });

  it('27 rejects thenable, invalid and hostile focus results without assimilating them', () => {
    let thenCalls = 0;
    const results: unknown[] = [
      { then: () => thenCalls++ },
      7,
      {},
      Object.defineProperty({}, 'then', {
        get() {
          throw new Error('hostile');
        },
      }),
    ];
    for (const result of results) {
      const actor = start(input({ onFocusExitRequest: () => result }));
      actor.send({ type: 'COMPONENT_DESTROYED', ownsFocus: true });
      expect(actor.getSnapshot().matches('terminal')).toBe(true);
    }
    expect(thenCalls).toBe(0);
  });

  it('28 nested destroy cleanup reaches terminal across mismatch, release throw and diagnostic throw', () => {
    const registry: DetailsIdLeaseRegistry = {
      reserve: () => 'reserved',
      release: () => {
        throw new Error('release');
      },
    };
    const actor = start(
      input({
        onFocusExitRequest: () => {
          throw new Error('port');
        },
      }),
      {
        registry,
        onDiagnostic: () => {
          throw new Error('diagnostic');
        },
      }
    );
    actor.send({ type: 'COMPONENT_DESTROYED', ownsFocus: true });
    expect(actor.getSnapshot().matches('terminal')).toBe(true);
    expect(actor.getSnapshot().context.destroyCompleted).toBe(true);

    const unfocused = vi.fn(() => 'cv_heading' as const);
    const second = start(input({ onFocusExitRequest: unfocused }));
    second.send({ type: 'COMPONENT_DESTROYED', ownsFocus: false });
    expect(unfocused).not.toHaveBeenCalled();
    expect(second.getSnapshot().matches('terminal')).toBe(true);
  });
});
