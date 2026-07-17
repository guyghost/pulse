import { assign, createActor, setup } from 'xstate';
import type { Experience } from '../lib/core/types/profile';

export type FocusExitResult =
  | 'next_experience_article'
  | 'previous_experience_article'
  | 'add_experience_button'
  | 'cv_heading'
  | null;

export interface FocusExitRequest {
  readonly experienceId: string;
  readonly positionIndex: number;
  readonly orderedTargets: readonly [
    'next_experience_article',
    'previous_experience_article',
    'add_experience_button',
    'cv_heading',
  ];
}

export interface ExperienceFormData {
  title: string;
  company: string;
  employmentType: string;
  location: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  skills: string[];
}

type ParentCallbackResult = unknown;
type ZeroArgumentCallback = () => ParentCallbackResult;
type SaveCallback = (experience: Experience) => ParentCallbackResult;
type FocusExitCallback = (request: FocusExitRequest) => unknown;

export interface ExperienceCardInput {
  readonly experience: Experience;
  readonly isEditing: boolean;
  readonly isBusy: boolean;
  readonly draft: Experience | null;
  readonly onEdit?: ZeroArgumentCallback;
  readonly onDelete?: ZeroArgumentCallback;
  readonly onSave?: SaveCallback;
  readonly onCancelEdit?: ZeroArgumentCallback;
  readonly onFocusExitRequest?: FocusExitCallback;
}

export interface ExperienceCardInputInit {
  experience: Experience;
  isEditing: boolean;
  isBusy: boolean;
  draft: Experience | null;
  onEdit?: ZeroArgumentCallback;
  onDelete?: ZeroArgumentCallback;
  onSave?: SaveCallback;
  onCancelEdit?: ZeroArgumentCallback;
  onFocusExitRequest?: FocusExitCallback;
}

export type ExperienceAccessibilitySignature = readonly [
  id: string,
  title: string,
  company: string | null,
  description: string,
  skills: readonly string[],
  isEditing: boolean,
  draftId: string | null,
  isBusy: boolean,
  hasOnEdit: boolean,
  hasOnDelete: boolean,
  hasOnSave: boolean,
  hasOnCancelEdit: boolean,
  hasOnFocusExitRequest: boolean,
];

export interface ExperienceAccessibilityProjection {
  readonly displayTitle: string;
  readonly displayCompany: string;
  readonly normalizedDescription: string;
  readonly normalizedSkills: readonly string[];
  readonly cardName: string;
  readonly toggleName: string;
  readonly regionName: string;
  readonly hasDetails: boolean;
}

export type InputChangeKind =
  'same' | 'capability' | 'callback_reference' | 'presentation' | 'semantic';

export interface ExperienceCardInputChange {
  readonly kind: InputChangeKind;
}

export type ExperienceCardFocusedControl =
  | 'article'
  | 'toggle'
  | 'details'
  | 'edit'
  | 'delete'
  | 'title'
  | 'save'
  | 'cancel'
  | 'current'
  | 'other_owned'
  | 'other';

export interface ExperienceCardCallbacksSnapshot {
  readonly onEdit?: ZeroArgumentCallback;
  readonly onDelete?: ZeroArgumentCallback;
  readonly onSave?: SaveCallback;
  readonly onCancelEdit?: ZeroArgumentCallback;
  readonly onFocusExitRequest?: FocusExitCallback;
}

export interface DetailsIdLeaseRegistry {
  reserve(scope: object, detailsId: string, owner: object): 'reserved' | 'owned' | 'collision';
  release(scope: object, detailsId: string, owner: object): 'released' | 'missing' | 'mismatch';
}

export type ExperienceCardUnavailableReason =
  | 'no_details'
  | 'invalid_edit_input'
  | 'draft_owner_mismatch'
  | 'invalid_details_id'
  | 'details_id_collision';

export type ExperienceCardFocusTarget =
  'title' | 'company' | 'startDate' | 'endDate' | 'skills' | 'article' | 'current';

export type NativeToggleActivationSource = 'pointer' | 'Enter' | 'Space';

export interface NativeToggleActivationPort {
  keydown(key: string): void;
  click(detail: number): void;
}

/**
 * Keeps the native button event adapter deterministic without preventing the
 * browser's own Enter/Space activation behavior.
 */
export function createNativeToggleActivationPort(
  dispatch: (source: NativeToggleActivationSource) => void
): NativeToggleActivationPort {
  let pendingKeyboardSource: Exclude<NativeToggleActivationSource, 'pointer'> | null = null;

  return Object.freeze({
    keydown(key: string): void {
      pendingKeyboardSource =
        key === 'Enter' ? 'Enter' : key === ' ' || key === 'Spacebar' ? 'Space' : null;
    },
    click(detail: number): void {
      const source = detail === 0 ? (pendingKeyboardSource ?? 'Enter') : 'pointer';
      pendingKeyboardSource = null;
      dispatch(source);
    },
  });
}

export function createCvExperienceCardAccessibilityActor(
  options: CreateCvExperienceCardAccessibilityMachineOptions
) {
  const externalBoundaryAuthority = {};
  const actor = createActor(
    createCvExperienceCardAccessibilityMachine(options, externalBoundaryAuthority)
  );
  const subscribe: typeof actor.subscribe = actor.subscribe.bind(actor);
  const getSnapshot: typeof actor.getSnapshot = actor.getSnapshot.bind(actor);

  return {
    start(): void {
      actor.start();
    },
    stop(): void {
      actor.stop();
    },
    send(value: unknown): void {
      const decoded = decodeExperienceCardMachineEvent(value);
      actor.send(
        decoded ??
          Object.freeze({
            type: INTERNAL_INVALID_EXTERNAL_EVENT,
            authority: externalBoundaryAuthority,
          })
      );
    },
    subscribe,
    getSnapshot,
  };
}

export interface ExperienceCardDiagnostic {
  readonly code: string;
  readonly field?: string;
  readonly reason?: string;
  readonly key?: string;
}

export interface ExperienceCardIdentityDiagnostic {
  readonly detailsId: string;
  readonly reason: 'INVALID_DETAILS_ID' | 'DETAILS_ID_COLLISION';
  readonly diagnosticKey: string;
  readonly reported: boolean;
}

type ParentIntentKind = 'edit' | 'delete' | 'save' | 'cancel';
type CallbackOutcome = 'fulfilled' | 'throw' | 'reject' | 'invalid_return';
type CallbackFailureKind = Exclude<CallbackOutcome, 'fulfilled'>;

export type DerivedInputEvent =
  | 'EDIT_EXITED_CHANGED'
  | 'EDIT_EXITED_UNCHANGED'
  | 'EDIT_STARTED'
  | 'EDIT_INPUT_REPLACED'
  | 'DISPLAY_INPUT_REPLACED'
  | 'INTERACTION_CAPABILITY_CHANGED'
  | 'EXPERIENCE_PRESENTATION_CHANGED'
  | 'CALLBACK_REFERENCE_CHANGED';

export interface CallbackSettlementRecord {
  readonly invocationId: number;
  readonly intentKind: ParentIntentKind;
  readonly outcome: CallbackOutcome;
  readonly consumed: boolean;
}

export interface ExperienceCardMachineContext {
  readonly input: ExperienceCardInput;
  readonly projection: ExperienceAccessibilityProjection;
  readonly instanceSuffix: string;
  readonly detailsId: string;
  readonly identityLease: 'unvalidated' | 'reserved' | 'rejected' | 'released';
  readonly identityDiagnostic: ExperienceCardIdentityDiagnostic | null;
  readonly unavailableReason: ExperienceCardUnavailableReason | null;
  readonly diagnostics: readonly ExperienceCardDiagnostic[];
  readonly focusRequest: { readonly target: ExperienceCardFocusTarget } | null;
  readonly nextInvocationId: number;
  readonly settledInvocationIds: ReadonlySet<number>;
  readonly settlementRecords: ReadonlyMap<number, CallbackSettlementRecord>;
  readonly settlementDiagnostics: ReadonlyMap<number, ExperienceCardDiagnostic>;
  readonly editBaseline:
    | readonly [
        id: string,
        title: string,
        company: string | null,
        description: string,
        skills: readonly string[],
      ]
    | null;
  readonly lastDerivedInputEvent: DerivedInputEvent | null;
  readonly destroyCompleted: boolean;
  readonly registry: DetailsIdLeaseRegistry;
  readonly scope: object;
  readonly ownerLeaseToken: object;
  readonly onDiagnostic?: (code: string) => void;
}

export type ExperienceCardMachineEvent =
  | {
      type: 'TOGGLE_REQUESTED';
      owner: string;
      source: NativeToggleActivationSource;
    }
  | { type: 'EDIT_REQUESTED' }
  | { type: 'DELETE_REQUESTED' }
  | { type: 'EDIT_SAVE_REQUESTED'; payload: unknown }
  | { type: 'EDIT_CANCEL_REQUESTED' }
  | {
      type: 'EXPERIENCE_INPUT_CHANGED';
      previous: ExperienceAccessibilitySignature;
      next: ExperienceAccessibilitySignature;
      nextExperience: Experience;
      nextDraft: Experience | null;
      nextCallbacks: ExperienceCardCallbacksSnapshot;
      focusedControl: ExperienceCardFocusedControl;
    }
  | {
      type: 'EXPERIENCE_PRESENTATION_CHANGED' | 'CALLBACK_REFERENCE_CHANGED';
      nextExperience: Experience;
      nextDraft: Experience | null;
      nextCallbacks: ExperienceCardCallbacksSnapshot;
      focusedControl: ExperienceCardFocusedControl;
    }
  | {
      type: 'PARENT_CALLBACK_FULFILLED';
      invocationId: number;
      intentKind: ParentIntentKind;
    }
  | {
      type: 'PARENT_CALLBACK_FAILED';
      invocationId: number;
      intentKind: ParentIntentKind;
      failureKind: CallbackFailureKind;
    }
  | { type: 'COMPONENT_DESTROYED'; ownsFocus: boolean };

const INTERNAL_CALLBACK_SETTLED = 'xstate.cv.parent-callback-settled' as const;
const INTERNAL_INVALID_EXTERNAL_EVENT = 'xstate.cv.invalid-external-event' as const;

interface InternalParentCallbackSettledEvent {
  readonly type: typeof INTERNAL_CALLBACK_SETTLED;
  readonly authority: object;
  readonly invocationId: number;
  readonly intentKind: ParentIntentKind;
  readonly outcome: CallbackOutcome;
}

interface InternalInvalidExternalEvent {
  readonly type: typeof INTERNAL_INVALID_EXTERNAL_EVENT;
  readonly authority: object;
}

type ExperienceCardMachineRuntimeEvent =
  ExperienceCardMachineEvent | InternalParentCallbackSettledEvent | InternalInvalidExternalEvent;

const INPUT_EVENT_TYPES = [
  'EXPERIENCE_INPUT_CHANGED',
  'EXPERIENCE_PRESENTATION_CHANGED',
  'CALLBACK_REFERENCE_CHANGED',
] as const;
const FOCUSED_CONTROLS: readonly ExperienceCardFocusedControl[] = [
  'article',
  'toggle',
  'details',
  'edit',
  'delete',
  'title',
  'save',
  'cancel',
  'current',
  'other_owned',
  'other',
];
const CALLBACK_KEYS = [
  'onEdit',
  'onDelete',
  'onSave',
  'onCancelEdit',
  'onFocusExitRequest',
] as const;
const EXPERIENCE_KEYS = [
  'id',
  'title',
  'company',
  'employmentType',
  'location',
  'startDate',
  'endDate',
  'isCurrent',
  'description',
  'skills',
  'source',
  'sourceExternalId',
  'positionIndex',
  'updatedAt',
] as const;

type DataDescriptorRecord = Readonly<Record<PropertyKey, PropertyDescriptor | undefined>>;

function copyClosedDataDescriptors(
  descriptors: DataDescriptorRecord,
  expectedKeys: readonly string[]
): Readonly<Record<string, unknown>> | null {
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
  ) {
    return null;
  }
  const result: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      return null;
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

function readClosedDataObject(
  value: unknown,
  expectedKeys: readonly string[]
): Readonly<Record<string, unknown>> | null {
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as DataDescriptorRecord;
    return copyClosedDataDescriptors(descriptors, expectedKeys);
  } catch {
    return null;
  }
}

function expectedMachineEventKeys(type: string): readonly string[] | null {
  if (
    type === 'EDIT_REQUESTED' ||
    type === 'DELETE_REQUESTED' ||
    type === 'EDIT_CANCEL_REQUESTED'
  ) {
    return ['type'];
  }
  if (type === 'TOGGLE_REQUESTED') {
    return ['type', 'owner', 'source'];
  }
  if (type === 'EDIT_SAVE_REQUESTED') {
    return ['type', 'payload'];
  }
  if (type === 'COMPONENT_DESTROYED') {
    return ['type', 'ownsFocus'];
  }
  if (type === 'PARENT_CALLBACK_FULFILLED') {
    return ['type', 'invocationId', 'intentKind'];
  }
  if (type === 'PARENT_CALLBACK_FAILED') {
    return ['type', 'invocationId', 'intentKind', 'failureKind'];
  }
  if ((INPUT_EVENT_TYPES as readonly string[]).includes(type)) {
    return type === 'EXPERIENCE_INPUT_CHANGED'
      ? [
          'type',
          'previous',
          'next',
          'nextExperience',
          'nextDraft',
          'nextCallbacks',
          'focusedControl',
        ]
      : ['type', 'nextExperience', 'nextDraft', 'nextCallbacks', 'focusedControl'];
  }
  return null;
}

function readClosedMachineEventDataObject(
  value: unknown
): Readonly<Record<string, unknown>> | null {
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as DataDescriptorRecord;
    const typeDescriptor = descriptors.type;
    if (
      typeDescriptor === undefined ||
      !typeDescriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(typeDescriptor, 'value') ||
      typeof typeDescriptor.value !== 'string'
    ) {
      return null;
    }
    const expectedKeys = expectedMachineEventKeys(typeDescriptor.value);
    return expectedKeys === null ? null : copyClosedDataDescriptors(descriptors, expectedKeys);
  } catch {
    return null;
  }
}

function readClosedArray(value: unknown, length: number): readonly unknown[] | null {
  try {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype ||
      value.length !== length
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expectedKeys = [...Array.from({ length }, (_, index) => String(index)), 'length'];
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return null;
    }
    const copy: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return null;
      }
      copy.push(descriptor.value);
    }
    return Object.freeze(copy);
  } catch {
    return null;
  }
}

function readClosedStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const copy = readClosedArray(value, value.length);
  return copy !== null && copy.every((entry) => typeof entry === 'string')
    ? Object.freeze(copy as string[])
    : null;
}

function readClosedSaveSkills(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Readonly<
    Record<PropertyKey, PropertyDescriptor | undefined>
  >;
  const lengthDescriptor = descriptors.length;
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value') ||
    typeof lengthDescriptor.value !== 'number' ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return null;
  }
  const length = lengthDescriptor.value;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== length + 1 ||
    keys.some((key) => {
      if (key === 'length') {
        return false;
      }
      if (typeof key !== 'string') {
        return true;
      }
      const index = Number(key);
      return !Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key;
    })
  ) {
    return null;
  }
  const copy: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      typeof descriptor.value !== 'string'
    ) {
      return null;
    }
    copy.push(descriptor.value);
  }
  return Object.freeze(copy);
}

function decodeSignature(value: unknown): ExperienceAccessibilitySignature | null {
  const tuple = readClosedArray(value, 13);
  if (tuple === null) {
    return null;
  }
  const skills = readClosedStringArray(tuple[4]);
  if (
    typeof tuple[0] !== 'string' ||
    typeof tuple[1] !== 'string' ||
    (tuple[2] !== null && typeof tuple[2] !== 'string') ||
    typeof tuple[3] !== 'string' ||
    skills === null ||
    typeof tuple[5] !== 'boolean' ||
    (tuple[6] !== null && typeof tuple[6] !== 'string') ||
    typeof tuple[7] !== 'boolean' ||
    !tuple.slice(8).every((entry) => typeof entry === 'boolean')
  ) {
    return null;
  }
  return Object.freeze([
    tuple[0],
    tuple[1],
    tuple[2],
    tuple[3],
    skills,
    tuple[5],
    tuple[6],
    tuple[7],
    tuple[8],
    tuple[9],
    tuple[10],
    tuple[11],
    tuple[12],
  ]) as ExperienceAccessibilitySignature;
}

function decodeExperience(value: unknown): Experience | null {
  const record = readClosedDataObject(value, EXPERIENCE_KEYS);
  if (record === null) {
    return null;
  }
  const nullableStrings = [
    record.company,
    record.employmentType,
    record.location,
    record.startDate,
    record.endDate,
    record.sourceExternalId,
  ];
  const skills = readClosedStringArray(record.skills);
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    nullableStrings.some((entry) => entry !== null && typeof entry !== 'string') ||
    typeof record.isCurrent !== 'boolean' ||
    typeof record.description !== 'string' ||
    skills === null ||
    (record.source !== 'linkedin' &&
      record.source !== 'manual' &&
      record.source !== 'connector-import') ||
    typeof record.positionIndex !== 'number' ||
    !Number.isSafeInteger(record.positionIndex) ||
    typeof record.updatedAt !== 'number' ||
    !Number.isFinite(record.updatedAt)
  ) {
    return null;
  }
  return freezeExperience({ ...(record as unknown as Experience), skills: [...skills] });
}

function decodeCallbacks(value: unknown): ExperienceCardCallbacksSnapshot | null {
  const record = readClosedDataObject(value, CALLBACK_KEYS);
  if (
    record === null ||
    CALLBACK_KEYS.some((key) => record[key] !== undefined && typeof record[key] !== 'function')
  ) {
    return null;
  }
  return Object.freeze({
    onEdit: record.onEdit as ZeroArgumentCallback | undefined,
    onDelete: record.onDelete as ZeroArgumentCallback | undefined,
    onSave: record.onSave as SaveCallback | undefined,
    onCancelEdit: record.onCancelEdit as ZeroArgumentCallback | undefined,
    onFocusExitRequest: record.onFocusExitRequest as FocusExitCallback | undefined,
  });
}

export function decodeExperienceCardMachineEvent(
  value: unknown
): ExperienceCardMachineEvent | null {
  try {
    const record = readClosedMachineEventDataObject(value);
    if (record === null || typeof record.type !== 'string') {
      return null;
    }
    const type = record.type;
    if (
      type === 'EDIT_REQUESTED' ||
      type === 'DELETE_REQUESTED' ||
      type === 'EDIT_CANCEL_REQUESTED'
    ) {
      return Object.freeze({ type });
    }
    if (type === 'TOGGLE_REQUESTED') {
      return typeof record.owner === 'string' &&
        (record.source === 'pointer' || record.source === 'Enter' || record.source === 'Space')
        ? Object.freeze({ type, owner: record.owner, source: record.source })
        : null;
    }
    if (type === 'EDIT_SAVE_REQUESTED') {
      return Object.freeze({ type, payload: record.payload });
    }
    if (type === 'COMPONENT_DESTROYED') {
      return typeof record.ownsFocus === 'boolean'
        ? Object.freeze({ type, ownsFocus: record.ownsFocus })
        : null;
    }
    if (type === 'PARENT_CALLBACK_FULFILLED' || type === 'PARENT_CALLBACK_FAILED') {
      if (
        !Number.isSafeInteger(record.invocationId) ||
        (record.invocationId as number) < 1 ||
        (record.intentKind !== 'edit' &&
          record.intentKind !== 'delete' &&
          record.intentKind !== 'save' &&
          record.intentKind !== 'cancel')
      ) {
        return null;
      }
      if (type === 'PARENT_CALLBACK_FULFILLED') {
        return Object.freeze({
          type,
          invocationId: record.invocationId as number,
          intentKind: record.intentKind,
        });
      }
      return record.failureKind === 'throw' ||
        record.failureKind === 'reject' ||
        record.failureKind === 'invalid_return'
        ? Object.freeze({
            type,
            invocationId: record.invocationId as number,
            intentKind: record.intentKind,
            failureKind: record.failureKind,
          })
        : null;
    }
    if ((INPUT_EVENT_TYPES as readonly string[]).includes(type)) {
      const isSignatureChange = type === 'EXPERIENCE_INPUT_CHANGED';
      const nextExperience = decodeExperience(record.nextExperience);
      const nextDraft = record.nextDraft === null ? null : decodeExperience(record.nextDraft);
      const nextCallbacks = decodeCallbacks(record.nextCallbacks);
      if (
        nextExperience === null ||
        (record.nextDraft !== null && nextDraft === null) ||
        nextCallbacks === null ||
        !FOCUSED_CONTROLS.includes(record.focusedControl as ExperienceCardFocusedControl)
      ) {
        return null;
      }
      const shared = {
        nextExperience,
        nextDraft,
        nextCallbacks,
        focusedControl: record.focusedControl as ExperienceCardFocusedControl,
      };
      if (isSignatureChange) {
        const previous = decodeSignature(record.previous);
        const next = decodeSignature(record.next);
        return previous === null || next === null
          ? null
          : Object.freeze({ type: 'EXPERIENCE_INPUT_CHANGED', previous, next, ...shared });
      }
      return Object.freeze({ type, ...shared }) as ExperienceCardMachineEvent;
    }
    return null;
  } catch {
    return null;
  }
}

export interface SaveValidationFailure {
  readonly ok: false;
  readonly focusTarget: ExperienceCardFocusTarget;
  readonly diagnostic: {
    readonly field: string;
    readonly reason: string;
  };
}

export interface SaveValidationSuccess {
  readonly ok: true;
  readonly value: Experience;
}

export type SaveValidationResult = SaveValidationFailure | SaveValidationSuccess;

const DETAILS_ID_PREFIX = 'cv-experience-details-';
const INSTANCE_SUFFIX_PATTERN = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;
const DETAILS_ID_PATTERN = /^cv-experience-details-[A-Za-z][A-Za-z0-9-]{0,63}$/;
const MONTH_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const FORM_KEYS = [
  'title',
  'company',
  'employmentType',
  'location',
  'startDate',
  'endDate',
  'isCurrent',
  'description',
  'skills',
] as const;
const FOCUS_EXIT_TARGETS = [
  'next_experience_article',
  'previous_experience_article',
  'add_experience_button',
  'cv_heading',
] as const;

const fallbackScope = {};

function freezeExperience(value: Experience): Experience {
  const skills = [...value.skills];
  Object.freeze(skills);
  return Object.freeze({
    id: value.id,
    title: value.title,
    company: value.company,
    employmentType: value.employmentType,
    location: value.location,
    startDate: value.startDate,
    endDate: value.endDate,
    isCurrent: value.isCurrent,
    description: value.description,
    skills,
    source: value.source,
    sourceExternalId: value.sourceExternalId,
    positionIndex: value.positionIndex,
    updatedAt: value.updatedAt,
  });
}

export function createExperienceCardInput(value: ExperienceCardInputInit): ExperienceCardInput {
  return Object.freeze({
    experience: freezeExperience(value.experience),
    isEditing: value.isEditing,
    isBusy: value.isBusy,
    draft: value.draft === null ? null : freezeExperience(value.draft),
    onEdit: value.onEdit,
    onDelete: value.onDelete,
    onSave: value.onSave,
    onCancelEdit: value.onCancelEdit,
    onFocusExitRequest: value.onFocusExitRequest,
  });
}

export function projectExperienceAccessibility(
  experience: Experience,
  expanded: boolean
): ExperienceAccessibilityProjection {
  const normalizedTitle = experience.title.trim();
  const normalizedCompany = (experience.company ?? '').trim();
  const normalizedDescription = experience.description.trim();
  const normalizedSkills = Object.freeze(
    experience.skills.map((skill) => skill.trim()).filter((skill) => skill.length > 0)
  );
  const displayTitle = normalizedTitle.length > 0 ? normalizedTitle : 'Sans titre';
  const displayCompany = normalizedCompany.length > 0 ? normalizedCompany : 'Entreprise inconnue';

  return Object.freeze({
    displayTitle,
    displayCompany,
    normalizedDescription,
    normalizedSkills,
    cardName: `Expérience ${displayTitle} chez ${displayCompany}`,
    toggleName: `${expanded ? 'Masquer' : 'Afficher'} les détails de l’expérience ${displayTitle}`,
    regionName: `Détails de l’expérience ${displayTitle}`,
    hasDetails: normalizedDescription.length > 0 || normalizedSkills.length > 0,
  });
}

export function getExperienceCardSignature(
  input: ExperienceCardInput
): ExperienceAccessibilitySignature {
  return Object.freeze([
    input.experience.id,
    input.experience.title,
    input.experience.company,
    input.experience.description,
    Object.freeze([...input.experience.skills]),
    input.isEditing,
    input.draft?.id ?? null,
    input.isBusy,
    typeof input.onEdit === 'function',
    typeof input.onDelete === 'function',
    typeof input.onSave === 'function',
    typeof input.onCancelEdit === 'function',
    typeof input.onFocusExitRequest === 'function',
  ]);
}

function orderedValuesEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  );
}

function signaturesEqual(
  left: ExperienceAccessibilitySignature,
  right: ExperienceAccessibilitySignature,
  endExclusive: number = left.length
): boolean {
  for (let index = 0; index < endExclusive; index += 1) {
    if (index === 4) {
      if (!orderedValuesEqual(left[4], right[4])) {
        return false;
      }
    } else if (!Object.is(left[index], right[index])) {
      return false;
    }
  }
  return true;
}

function experiencesEqual(left: Experience | null, right: Experience | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.company === right.company &&
    left.employmentType === right.employmentType &&
    left.location === right.location &&
    left.startDate === right.startDate &&
    left.endDate === right.endDate &&
    left.isCurrent === right.isCurrent &&
    left.description === right.description &&
    orderedValuesEqual(left.skills, right.skills) &&
    left.source === right.source &&
    left.sourceExternalId === right.sourceExternalId &&
    left.positionIndex === right.positionIndex &&
    left.updatedAt === right.updatedAt
  );
}

export function decodeExperienceCardInputChange(
  previous: ExperienceCardInput,
  next: ExperienceCardInput
): ExperienceCardInputChange {
  const previousSignature = getExperienceCardSignature(previous);
  const nextSignature = getExperienceCardSignature(next);

  if (!signaturesEqual(previousSignature, nextSignature)) {
    return Object.freeze({
      kind: signaturesEqual(previousSignature, nextSignature, 7) ? 'capability' : 'semantic',
    });
  }

  const callbacksEqual =
    Object.is(previous.onEdit, next.onEdit) &&
    Object.is(previous.onDelete, next.onDelete) &&
    Object.is(previous.onSave, next.onSave) &&
    Object.is(previous.onCancelEdit, next.onCancelEdit) &&
    Object.is(previous.onFocusExitRequest, next.onFocusExitRequest);
  if (!callbacksEqual) {
    return Object.freeze({ kind: 'callback_reference' });
  }

  if (
    !experiencesEqual(previous.experience, next.experience) ||
    !experiencesEqual(previous.draft, next.draft)
  ) {
    return Object.freeze({ kind: 'presentation' });
  }
  return Object.freeze({ kind: 'same' });
}

function callbacksSnapshot(input: ExperienceCardInput): ExperienceCardCallbacksSnapshot {
  return Object.freeze({
    onEdit: input.onEdit,
    onDelete: input.onDelete,
    onSave: input.onSave,
    onCancelEdit: input.onCancelEdit,
    onFocusExitRequest: input.onFocusExitRequest,
  });
}

export function decodeExperienceCardInputEvent(
  previous: ExperienceCardInput,
  nextValue: ExperienceCardInput,
  focusedControl: ExperienceCardFocusedControl
): Extract<
  ExperienceCardMachineEvent,
  {
    type:
      'EXPERIENCE_INPUT_CHANGED' | 'EXPERIENCE_PRESENTATION_CHANGED' | 'CALLBACK_REFERENCE_CHANGED';
  }
> | null {
  const next = createExperienceCardInput(nextValue);
  const change = decodeExperienceCardInputChange(previous, next);
  const shared = {
    nextExperience: next.experience,
    nextDraft: next.draft,
    nextCallbacks: callbacksSnapshot(next),
    focusedControl,
  } as const;

  if (change.kind === 'same') {
    return null;
  }
  if (change.kind === 'callback_reference') {
    return Object.freeze({ type: 'CALLBACK_REFERENCE_CHANGED', ...shared });
  }
  if (change.kind === 'presentation') {
    return Object.freeze({ type: 'EXPERIENCE_PRESENTATION_CHANGED', ...shared });
  }
  return Object.freeze({
    type: 'EXPERIENCE_INPUT_CHANGED',
    previous: getExperienceCardSignature(previous),
    next: getExperienceCardSignature(next),
    ...shared,
  });
}

type ExperienceInputMachineEvent = Extract<
  ExperienceCardMachineEvent,
  {
    type:
      'EXPERIENCE_INPUT_CHANGED' | 'EXPERIENCE_PRESENTATION_CHANGED' | 'CALLBACK_REFERENCE_CHANGED';
  }
>;

function inputFromMachineEvent(
  current: ExperienceCardInput,
  event: ExperienceInputMachineEvent
): ExperienceCardInput {
  const isSignatureChange = event.type === 'EXPERIENCE_INPUT_CHANGED';
  return createExperienceCardInput({
    experience: event.nextExperience,
    isEditing: isSignatureChange ? event.next[5] : current.isEditing,
    isBusy: isSignatureChange ? event.next[7] : current.isBusy,
    draft: event.nextDraft,
    ...event.nextCallbacks,
  });
}

function isValidInputMachineEvent(
  current: ExperienceCardInput,
  event: ExperienceInputMachineEvent
): boolean {
  try {
    const next = inputFromMachineEvent(current, event);
    const kind = decodeExperienceCardInputChange(current, next).kind;
    if (event.type === 'EXPERIENCE_INPUT_CHANGED') {
      return (
        (kind === 'semantic' || kind === 'capability') &&
        signaturesEqual(getExperienceCardSignature(current), event.previous) &&
        signaturesEqual(getExperienceCardSignature(next), event.next)
      );
    }
    return (
      (event.type === 'CALLBACK_REFERENCE_CHANGED' && kind === 'callback_reference') ||
      (event.type === 'EXPERIENCE_PRESENTATION_CHANGED' && kind === 'presentation')
    );
  } catch {
    return false;
  }
}

export function createDetailsIdLeaseRegistry(): DetailsIdLeaseRegistry {
  const leasesByScope = new WeakMap<object, Map<string, object>>();
  return {
    reserve(scope, detailsId, owner) {
      let leases = leasesByScope.get(scope);
      if (leases === undefined) {
        leases = new Map();
        leasesByScope.set(scope, leases);
      }
      const current = leases.get(detailsId);
      if (current === owner) {
        return 'owned';
      }
      if (current !== undefined) {
        return 'collision';
      }
      leases.set(detailsId, owner);
      return 'reserved';
    },
    release(scope, detailsId, owner) {
      const leases = leasesByScope.get(scope);
      if (leases === undefined || !leases.has(detailsId)) {
        return 'missing';
      }
      if (leases.get(detailsId) !== owner) {
        return 'mismatch';
      }
      leases.delete(detailsId);
      if (leases.size === 0) {
        leasesByScope.delete(scope);
      }
      return 'released';
    },
  };
}

export const detailsIdLeaseRegistry = createDetailsIdLeaseRegistry();

function saveFailure(
  field: string,
  reason: string,
  focusTarget: ExperienceCardFocusTarget
): SaveValidationFailure {
  return Object.freeze({
    ok: false,
    focusTarget,
    diagnostic: Object.freeze({ field, reason }),
  });
}

export function validateExperienceSavePayload(
  payload: unknown,
  draft: Experience
): SaveValidationResult {
  try {
    if (typeof payload !== 'object' || payload === null) {
      return saveFailure('payload', 'invalid_shape', 'article');
    }
    if (Object.getPrototypeOf(payload) !== Object.prototype) {
      return saveFailure('payload', 'invalid_shape', 'article');
    }
    const keys = Reflect.ownKeys(payload);
    if (
      keys.length !== FORM_KEYS.length ||
      keys.some(
        (key) => typeof key !== 'string' || !FORM_KEYS.includes(key as (typeof FORM_KEYS)[number])
      )
    ) {
      return saveFailure('payload', 'invalid_shape', 'article');
    }

    const values: Record<(typeof FORM_KEYS)[number], unknown> = {
      title: undefined,
      company: undefined,
      employmentType: undefined,
      location: undefined,
      startDate: undefined,
      endDate: undefined,
      isCurrent: undefined,
      description: undefined,
      skills: undefined,
    };
    for (const key of FORM_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(payload, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return saveFailure('payload', 'invalid_shape', 'article');
      }
      values[key] = descriptor.value;
    }

    const rawTitle = values.title;
    const rawCompany = values.company;
    const rawEmploymentType = values.employmentType;
    const rawLocation = values.location;
    const rawDescription = values.description;
    const rawStartDate = values.startDate;
    const rawEndDate = values.endDate;
    const rawIsCurrent = values.isCurrent;
    const rawSkills = values.skills;
    if (typeof rawTitle !== 'string') {
      return saveFailure('title', 'invalid_type', 'article');
    }
    if (typeof rawCompany !== 'string') {
      return saveFailure('company', 'invalid_type', 'article');
    }
    if (typeof rawEmploymentType !== 'string') {
      return saveFailure('employmentType', 'invalid_type', 'article');
    }
    if (typeof rawLocation !== 'string') {
      return saveFailure('location', 'invalid_type', 'article');
    }
    if (typeof rawDescription !== 'string') {
      return saveFailure('description', 'invalid_type', 'article');
    }
    if (typeof rawIsCurrent !== 'boolean') {
      return saveFailure('isCurrent', 'invalid_type', 'article');
    }
    if (
      (rawStartDate !== null && typeof rawStartDate !== 'string') ||
      (rawEndDate !== null && typeof rawEndDate !== 'string')
    ) {
      return saveFailure('payload', 'invalid_type', 'article');
    }
    const skillValues = readClosedSaveSkills(rawSkills);
    if (skillValues === null) {
      return saveFailure('skills', 'invalid_type', 'article');
    }

    const title = rawTitle.trim();
    if (title.length === 0) {
      return saveFailure('title', 'required', 'title');
    }
    const company = rawCompany.trim();
    if (company.length === 0) {
      return saveFailure('company', 'required', 'company');
    }
    const startDate = (rawStartDate ?? '').trim();
    if (!MONTH_PATTERN.test(startDate)) {
      return saveFailure('startDate', 'invalid_month', 'startDate');
    }
    if (rawIsCurrent && rawEndDate !== null) {
      return saveFailure('endDate', 'current_requires_null', 'current');
    }
    const endDate = rawIsCurrent ? null : rawEndDate?.trim() || null;
    if (endDate !== null && !MONTH_PATTERN.test(endDate)) {
      return saveFailure('endDate', 'invalid_month', 'endDate');
    }

    const skills = skillValues.map((skill) => skill.trim()).filter((skill) => skill.length > 0);
    Object.freeze(skills);
    const candidate: Experience = {
      id: draft.id,
      title,
      company,
      employmentType: rawEmploymentType.trim() || null,
      location: rawLocation.trim() || null,
      startDate,
      endDate,
      isCurrent: rawIsCurrent,
      description: rawDescription.trim(),
      skills,
      source: draft.source,
      sourceExternalId: draft.sourceExternalId,
      positionIndex: draft.positionIndex,
      updatedAt: draft.updatedAt,
    };
    return Object.freeze({ ok: true, value: Object.freeze(candidate) });
  } catch {
    return saveFailure('payload', 'inspection_failed', 'article');
  }
}

function classifyInput(
  context: Pick<ExperienceCardMachineContext, 'identityLease' | 'unavailableReason'>,
  input: ExperienceCardInput
): {
  state: 'display' | 'editing' | 'unavailable';
  reason: ExperienceCardUnavailableReason | null;
} {
  if (context.identityLease === 'rejected') {
    return {
      state: 'unavailable',
      reason:
        context.unavailableReason === 'invalid_details_id'
          ? 'invalid_details_id'
          : 'details_id_collision',
    };
  }
  if (input.isEditing && input.draft === null) {
    return { state: 'unavailable', reason: 'invalid_edit_input' };
  }
  if (input.isEditing && input.draft?.id !== input.experience.id) {
    return { state: 'unavailable', reason: 'draft_owner_mismatch' };
  }
  if (input.isEditing) {
    return { state: 'editing', reason: null };
  }
  if (projectExperienceAccessibility(input.experience, false).hasDetails) {
    return { state: 'display', reason: null };
  }
  return { state: 'unavailable', reason: 'no_details' };
}

function diagnosticForUnavailable(
  reason: ExperienceCardUnavailableReason | null
): ExperienceCardDiagnostic | null {
  if (reason === 'invalid_edit_input') {
    return Object.freeze({ code: 'INVALID_EDIT_INPUT' });
  }
  if (reason === 'draft_owner_mismatch') {
    return Object.freeze({ code: 'DRAFT_OWNER_MISMATCH' });
  }
  return null;
}

function appendReportedDiagnostic(
  context: ExperienceCardMachineContext,
  diagnostics: readonly ExperienceCardDiagnostic[],
  diagnostic: ExperienceCardDiagnostic
): readonly ExperienceCardDiagnostic[] {
  const next = [...diagnostics, Object.freeze(diagnostic)];
  try {
    context.onDiagnostic?.(diagnostic.code);
  } catch {
    next.push(Object.freeze({ code: 'CONTRACT_DIAGNOSTIC_FAILED' }));
  }
  return Object.freeze(next);
}

function editBaseline(
  value: Experience
): NonNullable<ExperienceCardMachineContext['editBaseline']> {
  return Object.freeze([
    value.id,
    value.title,
    value.company,
    value.description,
    Object.freeze([...value.skills]),
  ]);
}

function editBaselinesEqual(
  left: NonNullable<ExperienceCardMachineContext['editBaseline']>,
  right: NonNullable<ExperienceCardMachineContext['editBaseline']>
): boolean {
  return (
    Object.is(left[0], right[0]) &&
    Object.is(left[1], right[1]) &&
    Object.is(left[2], right[2]) &&
    Object.is(left[3], right[3]) &&
    orderedValuesEqual(left[4], right[4])
  );
}

function deriveInputEvent(
  context: ExperienceCardMachineContext,
  next: ExperienceCardInput,
  kind: InputChangeKind
): {
  readonly event: DerivedInputEvent;
  readonly nextBaseline: ExperienceCardMachineContext['editBaseline'];
} {
  if (kind === 'capability') {
    return Object.freeze({
      event: 'INTERACTION_CAPABILITY_CHANGED',
      nextBaseline: context.editBaseline,
    });
  }
  if (context.input.isEditing && !next.isEditing) {
    const baseline = context.editBaseline ?? editBaseline(context.input.experience);
    return Object.freeze({
      event: editBaselinesEqual(baseline, editBaseline(next.experience))
        ? 'EDIT_EXITED_UNCHANGED'
        : 'EDIT_EXITED_CHANGED',
      nextBaseline: null,
    });
  }
  if (!context.input.isEditing && next.isEditing) {
    return Object.freeze({ event: 'EDIT_STARTED', nextBaseline: editBaseline(next.experience) });
  }
  if (next.isEditing) {
    return Object.freeze({ event: 'EDIT_INPUT_REPLACED', nextBaseline: context.editBaseline });
  }
  return Object.freeze({ event: 'DISPLAY_INPUT_REPLACED', nextBaseline: null });
}

function focusForInputChange(
  previous: ExperienceCardInput,
  next: ExperienceCardInput,
  kind: InputChangeKind,
  focusedControl: ExperienceCardFocusedControl,
  identityLease: ExperienceCardMachineContext['identityLease']
): { readonly target: ExperienceCardFocusTarget } | null {
  if (focusedControl === 'other') {
    return null;
  }
  if (kind === 'semantic') {
    const nextEditingInputValid =
      identityLease === 'reserved' &&
      next.isEditing &&
      next.draft !== null &&
      next.draft.id === next.experience.id;
    if (!previous.isEditing && next.isEditing) {
      return Object.freeze({ target: nextEditingInputValid ? 'title' : 'article' });
    }
    if (previous.isEditing && !next.isEditing) {
      return Object.freeze({ target: 'article' });
    }
    if (next.isEditing) {
      if (!nextEditingInputValid) {
        return Object.freeze({ target: 'article' });
      }
      if (
        previous.draft === null ||
        previous.draft.id !== previous.experience.id ||
        previous.experience.id !== next.experience.id
      ) {
        return Object.freeze({ target: 'title' });
      }
    } else if (
      previous.experience.id !== next.experience.id ||
      focusedControl === 'details' ||
      (focusedControl === 'toggle' &&
        !projectExperienceAccessibility(next.experience, false).hasDetails)
    ) {
      return Object.freeze({ target: 'article' });
    }
  }

  const displayControlRemoved =
    (focusedControl === 'edit' && (next.isBusy || typeof next.onEdit !== 'function')) ||
    (focusedControl === 'delete' && (next.isBusy || typeof next.onDelete !== 'function'));
  if (displayControlRemoved) {
    return Object.freeze({ target: 'article' });
  }
  const editControlRemoved =
    (focusedControl === 'save' && (next.isBusy || typeof next.onSave !== 'function')) ||
    (focusedControl === 'cancel' && (next.isBusy || typeof next.onCancelEdit !== 'function'));
  if (editControlRemoved) {
    return Object.freeze({ target: 'title' });
  }
  return null;
}

function callbackDiagnostic(outcome: CallbackOutcome): string {
  if (outcome === 'fulfilled') {
    return 'PARENT_CALLBACK_FULFILLED';
  }
  if (outcome === 'throw') {
    return 'PARENT_CALLBACK_THROW';
  }
  if (outcome === 'reject') {
    return 'PARENT_CALLBACK_REJECTED';
  }
  return 'INVALID_CALLBACK_RESULT';
}

export function haveParentCallbackSettlementsCompleted(
  context: Pick<
    ExperienceCardMachineContext,
    'nextInvocationId' | 'settledInvocationIds' | 'settlementRecords'
  >
): boolean {
  const invocationCount = context.nextInvocationId - 1;
  if (
    context.settledInvocationIds.size !== invocationCount ||
    context.settlementRecords.size !== invocationCount
  ) {
    return false;
  }
  for (let invocationId = 1; invocationId <= invocationCount; invocationId += 1) {
    if (
      !context.settledInvocationIds.has(invocationId) ||
      context.settlementRecords.get(invocationId)?.consumed !== true
    ) {
      return false;
    }
  }
  return true;
}

function invokeConfinedCallback(
  callback: () => unknown,
  settleOnce: (outcome: CallbackOutcome) => void
): void {
  try {
    const result = callback();
    if (result === undefined) {
      settleOnce('fulfilled');
      return;
    }
    if ((typeof result !== 'object' && typeof result !== 'function') || result === null) {
      settleOnce('invalid_return');
      return;
    }
    try {
      Promise.resolve(result).then(
        (value) => settleOnce(value === undefined ? 'fulfilled' : 'invalid_return'),
        () => settleOnce('reject')
      );
    } catch {
      settleOnce('throw');
    }
  } catch {
    settleOnce('throw');
  }
}

function destroyContext(
  context: ExperienceCardMachineContext,
  ownsFocus: boolean
): Partial<ExperienceCardMachineContext> {
  let diagnostics = context.diagnostics;
  let identityLease = context.identityLease;
  let destroyCompleted = false;

  try {
    if (ownsFocus) {
      const callback = context.input.onFocusExitRequest;
      if (typeof callback !== 'function') {
        diagnostics = appendReportedDiagnostic(
          context,
          diagnostics,
          Object.freeze({ code: 'FOCUS_EXIT_PORT_MISSING' })
        );
      } else {
        const request: FocusExitRequest = Object.freeze({
          experienceId: context.input.experience.id,
          positionIndex: context.input.experience.positionIndex,
          orderedTargets: Object.freeze([
            ...FOCUS_EXIT_TARGETS,
          ]) as FocusExitRequest['orderedTargets'],
        });
        let result: unknown;
        try {
          result = callback(request);
          if (result === null) {
            diagnostics = appendReportedDiagnostic(
              context,
              diagnostics,
              Object.freeze({ code: 'FOCUS_EXIT_TARGET_MISSING' })
            );
          } else if (FOCUS_EXIT_TARGETS.some((target) => result === target)) {
            // A valid synchronous receipt has no state authority.
          } else if (
            (typeof result === 'object' && result !== null) ||
            typeof result === 'function'
          ) {
            try {
              const then = Reflect.get(result, 'then');
              diagnostics = appendReportedDiagnostic(
                context,
                diagnostics,
                Object.freeze({
                  code:
                    typeof then === 'function'
                      ? 'FOCUS_EXIT_ASYNC_RETURN'
                      : 'INVALID_FOCUS_EXIT_RESULT',
                })
              );
            } catch {
              diagnostics = appendReportedDiagnostic(
                context,
                diagnostics,
                Object.freeze({ code: 'FOCUS_EXIT_RESULT_INSPECTION_FAILED' })
              );
            }
          } else {
            diagnostics = appendReportedDiagnostic(
              context,
              diagnostics,
              Object.freeze({ code: 'INVALID_FOCUS_EXIT_RESULT' })
            );
          }
        } catch {
          diagnostics = appendReportedDiagnostic(
            context,
            diagnostics,
            Object.freeze({ code: 'FOCUS_EXIT_PORT_THROW' })
          );
        }
      }
    }
  } finally {
    try {
      if (identityLease === 'reserved') {
        try {
          const release = context.registry.release(
            context.scope,
            context.detailsId,
            context.ownerLeaseToken
          );
          if (release === 'released') {
            identityLease = 'released';
          } else {
            diagnostics = appendReportedDiagnostic(
              context,
              diagnostics,
              Object.freeze({ code: 'DETAILS_ID_RELEASE_MISMATCH' })
            );
          }
        } catch {
          diagnostics = appendReportedDiagnostic(
            context,
            diagnostics,
            Object.freeze({ code: 'DETAILS_ID_RELEASE_FAILED' })
          );
        }
      }
    } finally {
      destroyCompleted = true;
    }
  }
  return {
    diagnostics,
    identityLease,
    destroyCompleted,
    focusRequest: null,
  };
}

export interface CreateCvExperienceCardAccessibilityMachineOptions {
  input: ExperienceCardInput;
  instanceSuffix: string;
  registry?: DetailsIdLeaseRegistry;
  scope?: object;
  onDiagnostic?: (code: string) => void;
}

function createCvExperienceCardAccessibilityMachine(
  options: CreateCvExperienceCardAccessibilityMachineOptions,
  externalBoundaryAuthority: object
) {
  const registry = options.registry ?? detailsIdLeaseRegistry;
  const scope =
    options.scope ?? (typeof document === 'object' && document !== null ? document : fallbackScope);
  const ownerLeaseToken = {};
  const detailsId = `${DETAILS_ID_PREFIX}${options.instanceSuffix}`;
  const suffixValid =
    options.instanceSuffix.length >= 1 &&
    options.instanceSuffix.length <= 64 &&
    INSTANCE_SUFFIX_PATTERN.test(options.instanceSuffix);
  const detailsIdValid =
    detailsId.length >= 23 && detailsId.length <= 86 && DETAILS_ID_PATTERN.test(detailsId);

  let identityLease: ExperienceCardMachineContext['identityLease'] = 'unvalidated';
  let identityDiagnostic: ExperienceCardIdentityDiagnostic | null = null;
  let unavailableReason: ExperienceCardUnavailableReason | null = null;
  const initialDiagnostics: ExperienceCardDiagnostic[] = [];
  if (!suffixValid || !detailsIdValid) {
    identityLease = 'rejected';
    unavailableReason = 'invalid_details_id';
    const diagnosticKey = `INVALID_DETAILS_ID:${detailsId.length}:${detailsId}:${options.instanceSuffix.length}:${options.instanceSuffix}`;
    identityDiagnostic = Object.freeze({
      detailsId,
      reason: 'INVALID_DETAILS_ID',
      diagnosticKey,
      reported: false,
    });
    initialDiagnostics.push(Object.freeze({ code: 'INVALID_DETAILS_ID', key: diagnosticKey }));
  } else {
    const reservation = registry.reserve(scope, detailsId, ownerLeaseToken);
    if (reservation === 'collision') {
      identityLease = 'rejected';
      unavailableReason = 'details_id_collision';
      const diagnosticKey = `DETAILS_ID_COLLISION:${detailsId.length}:${detailsId}:${options.instanceSuffix.length}:${options.instanceSuffix}`;
      identityDiagnostic = Object.freeze({
        detailsId,
        reason: 'DETAILS_ID_COLLISION',
        diagnosticKey,
        reported: false,
      });
      initialDiagnostics.push(Object.freeze({ code: 'DETAILS_ID_COLLISION', key: diagnosticKey }));
    } else {
      identityLease = 'reserved';
    }
  }

  const frozenInput = createExperienceCardInput(options.input);
  const initialClassification = classifyInput({ identityLease, unavailableReason }, frozenInput);
  unavailableReason = initialClassification.reason;
  const inputDiagnostic = diagnosticForUnavailable(unavailableReason);
  if (inputDiagnostic !== null) {
    initialDiagnostics.push(inputDiagnostic);
  }

  const settlementAuthority = {};
  const decodedMachineEvent = (value: unknown): ExperienceCardMachineEvent | null => {
    return decodeExperienceCardMachineEvent(value);
  };
  const isCurrentSettlementEvent = (
    context: ExperienceCardMachineContext,
    value: unknown
  ): boolean => {
    const decoded = decodedMachineEvent(value);
    if (
      decoded?.type !== 'PARENT_CALLBACK_FULFILLED' &&
      decoded?.type !== 'PARENT_CALLBACK_FAILED'
    ) {
      return false;
    }
    const outcome: CallbackOutcome =
      decoded.type === 'PARENT_CALLBACK_FULFILLED' ? 'fulfilled' : decoded.failureKind;
    const current = context.settlementRecords.get(decoded.invocationId);
    return (
      current !== undefined &&
      current.intentKind === decoded.intentKind &&
      current.outcome === outcome &&
      !current.consumed
    );
  };
  const settleParentCallback = (
    invocationId: number,
    intentKind: ParentIntentKind,
    outcome: CallbackOutcome,
    send: (event: ExperienceCardMachineRuntimeEvent) => void
  ): void => {
    send(
      Object.freeze({
        type: INTERNAL_CALLBACK_SETTLED,
        authority: settlementAuthority,
        invocationId,
        intentKind,
        outcome,
      })
    );
  };

  const initialContext: ExperienceCardMachineContext = {
    input: frozenInput,
    projection: projectExperienceAccessibility(frozenInput.experience, false),
    instanceSuffix: options.instanceSuffix,
    detailsId,
    identityLease,
    identityDiagnostic,
    unavailableReason,
    diagnostics: Object.freeze(initialDiagnostics),
    focusRequest: null,
    nextInvocationId: 1,
    settledInvocationIds: new Set(),
    settlementRecords: new Map(),
    settlementDiagnostics: new Map(),
    editBaseline: frozenInput.isEditing ? editBaseline(frozenInput.experience) : null,
    lastDerivedInputEvent: null,
    destroyCompleted: false,
    registry,
    scope,
    ownerLeaseToken,
    onDiagnostic: options.onDiagnostic,
  };

  return setup({
    types: {
      context: {} as ExperienceCardMachineContext,
      events: {} as ExperienceCardMachineRuntimeEvent,
    },
    guards: {
      authorizedInternalSettlement: ({ event }) =>
        event.type === INTERNAL_CALLBACK_SETTLED && event.authority === settlementAuthority,
      authorizedInvalidExternalEvent: ({ event }) =>
        event.type === INTERNAL_INVALID_EXTERNAL_EVENT &&
        event.authority === externalBoundaryAuthority,
      initiallyEditing: () => initialClassification.state === 'editing',
      initiallyDisplay: () => initialClassification.state === 'display',
      ownToggle: ({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return (
          decoded?.type === 'TOGGLE_REQUESTED' &&
          decoded.owner === context.instanceSuffix &&
          context.identityLease === 'reserved' &&
          context.projection.hasDetails
        );
      },
      canEditDisplay: ({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return (
          decoded?.type === 'EDIT_REQUESTED' &&
          !context.input.isBusy &&
          typeof context.input.onEdit === 'function'
        );
      },
      canDeleteDisplay: ({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return (
          decoded?.type === 'DELETE_REQUESTED' &&
          !context.input.isBusy &&
          typeof context.input.onDelete === 'function'
        );
      },
      canEditUnavailable: ({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return (
          decoded?.type === 'EDIT_REQUESTED' &&
          context.unavailableReason === 'no_details' &&
          !context.input.isBusy &&
          typeof context.input.onEdit === 'function'
        );
      },
      canDeleteUnavailable: ({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return (
          decoded?.type === 'DELETE_REQUESTED' &&
          context.unavailableReason === 'no_details' &&
          !context.input.isBusy &&
          typeof context.input.onDelete === 'function'
        );
      },
      canCancel: ({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return (
          decoded?.type === 'EDIT_CANCEL_REQUESTED' &&
          !context.input.isBusy &&
          typeof context.input.onCancelEdit === 'function' &&
          context.input.draft !== null &&
          context.input.draft.id === context.input.experience.id
        );
      },
      canSave: ({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return (
          decoded?.type === 'EDIT_SAVE_REQUESTED' &&
          !context.input.isBusy &&
          typeof context.input.onSave === 'function' &&
          context.input.draft !== null &&
          context.input.draft.id === context.input.experience.id
        );
      },
      validInputEvent: ({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return (
          decoded !== null &&
          (decoded.type === 'EXPERIENCE_INPUT_CHANGED' ||
            decoded.type === 'EXPERIENCE_PRESENTATION_CHANGED' ||
            decoded.type === 'CALLBACK_REFERENCE_CHANGED') &&
          isValidInputMachineEvent(context.input, decoded)
        );
      },
      inputChangePreservesState: ({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return (
          decoded?.type === 'EXPERIENCE_INPUT_CHANGED' &&
          isValidInputMachineEvent(context.input, decoded) &&
          decodeExperienceCardInputChange(
            context.input,
            inputFromMachineEvent(context.input, decoded)
          ).kind === 'capability'
        );
      },
      nextInputEditing: ({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return (
          decoded?.type === 'EXPERIENCE_INPUT_CHANGED' &&
          isValidInputMachineEvent(context.input, decoded) &&
          classifyInput(context, inputFromMachineEvent(context.input, decoded)).state === 'editing'
        );
      },
      nextInputDisplay: ({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return (
          decoded?.type === 'EXPERIENCE_INPUT_CHANGED' &&
          isValidInputMachineEvent(context.input, decoded) &&
          classifyInput(context, inputFromMachineEvent(context.input, decoded)).state === 'display'
        );
      },
      currentSettlementEvent: ({ context, event }) => isCurrentSettlementEvent(context, event),
      validDestroyEvent: ({ event }) => decodedMachineEvent(event)?.type === 'COMPONENT_DESTROYED',
    },
    actions: {
      reportIdentityDiagnostic: assign(({ context }) => {
        const diagnostic = context.identityDiagnostic;
        if (diagnostic === null || diagnostic.reported) {
          return {};
        }
        let diagnostics = context.diagnostics;
        try {
          context.onDiagnostic?.(diagnostic.reason);
        } catch {
          diagnostics = Object.freeze([
            ...diagnostics,
            Object.freeze({ code: 'CONTRACT_DIAGNOSTIC_FAILED' }),
          ]);
        }
        return {
          identityDiagnostic: Object.freeze({ ...diagnostic, reported: true }),
          diagnostics,
        };
      }),
      reportInitialInputDiagnostic: assign(({ context }) => {
        if (inputDiagnostic === null) {
          return {};
        }
        try {
          context.onDiagnostic?.(inputDiagnostic.code);
          return {};
        } catch {
          return {
            diagnostics: Object.freeze([
              ...context.diagnostics,
              Object.freeze({ code: 'CONTRACT_DIAGNOSTIC_FAILED' }),
            ]),
          };
        }
      }),
      expand: assign(({ context }) => ({
        projection: projectExperienceAccessibility(context.input.experience, true),
        focusRequest: null,
      })),
      collapse: assign(({ context }) => ({
        projection: projectExperienceAccessibility(context.input.experience, false),
        focusRequest: null,
      })),
      rejectUiIntent: () => undefined,
      replaceInputPreservingState: assign(({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        if (
          decoded === null ||
          (decoded.type !== 'EXPERIENCE_INPUT_CHANGED' &&
            decoded.type !== 'EXPERIENCE_PRESENTATION_CHANGED' &&
            decoded.type !== 'CALLBACK_REFERENCE_CHANGED')
        ) {
          return {};
        }
        const next = inputFromMachineEvent(context.input, decoded);
        const kind = decodeExperienceCardInputChange(context.input, next).kind;
        const classification = classifyInput(context, next);
        const diagnostic =
          decoded.type === 'EXPERIENCE_INPUT_CHANGED'
            ? diagnosticForUnavailable(classification.reason)
            : null;
        const derived =
          decoded.type === 'EXPERIENCE_PRESENTATION_CHANGED'
            ? Object.freeze({
                event: 'EXPERIENCE_PRESENTATION_CHANGED' as const,
                nextBaseline: context.editBaseline,
              })
            : decoded.type === 'CALLBACK_REFERENCE_CHANGED'
              ? Object.freeze({
                  event: 'CALLBACK_REFERENCE_CHANGED' as const,
                  nextBaseline: context.editBaseline,
                })
              : deriveInputEvent(context, next, kind);
        return {
          input: next,
          unavailableReason: classification.reason,
          diagnostics:
            diagnostic === null
              ? context.diagnostics
              : appendReportedDiagnostic(context, context.diagnostics, diagnostic),
          focusRequest: focusForInputChange(
            context.input,
            next,
            kind,
            decoded.focusedControl,
            context.identityLease
          ),
          editBaseline: derived.nextBaseline,
          lastDerivedInputEvent: derived.event,
        };
      }),
      replaceInputAndClassify: assign(({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        if (decoded?.type !== 'EXPERIENCE_INPUT_CHANGED') {
          return {};
        }
        const next = inputFromMachineEvent(context.input, decoded);
        const kind = decodeExperienceCardInputChange(context.input, next).kind;
        const classification = classifyInput(context, next);
        const diagnostic = diagnosticForUnavailable(classification.reason);
        const derived = deriveInputEvent(context, next, kind);
        return {
          input: next,
          projection: projectExperienceAccessibility(next.experience, false),
          unavailableReason: classification.reason,
          focusRequest: focusForInputChange(
            context.input,
            next,
            kind,
            decoded.focusedControl,
            context.identityLease
          ),
          editBaseline: derived.nextBaseline,
          lastDerivedInputEvent: derived.event,
          diagnostics:
            diagnostic === null
              ? context.diagnostics
              : appendReportedDiagnostic(context, context.diagnostics, diagnostic),
        };
      }),
      invokeEdit: assign(({ context, self }) => {
        const callback = context.input.onEdit;
        if (typeof callback !== 'function') {
          return {};
        }
        const invocationId = context.nextInvocationId;
        invokeConfinedCallback(callback, (outcome) =>
          settleParentCallback(invocationId, 'edit', outcome, (event) => self.send(event))
        );
        return { nextInvocationId: invocationId + 1 };
      }),
      invokeDelete: assign(({ context, self }) => {
        const callback = context.input.onDelete;
        if (typeof callback !== 'function') {
          return {};
        }
        const invocationId = context.nextInvocationId;
        invokeConfinedCallback(callback, (outcome) =>
          settleParentCallback(invocationId, 'delete', outcome, (event) => self.send(event))
        );
        return { nextInvocationId: invocationId + 1 };
      }),
      handleSaveIntent: assign(({ context, event, self }) => {
        const decoded = decodedMachineEvent(event);
        if (decoded?.type !== 'EDIT_SAVE_REQUESTED' || context.input.draft === null) {
          return {};
        }
        const validation = validateExperienceSavePayload(decoded.payload, context.input.draft);
        if (!validation.ok) {
          return {
            diagnostics: appendReportedDiagnostic(
              context,
              context.diagnostics,
              Object.freeze({ code: 'INVALID_SAVE_PAYLOAD', ...validation.diagnostic })
            ),
            focusRequest: Object.freeze({ target: validation.focusTarget }),
          };
        }
        const invocationId = context.nextInvocationId;
        const callback = context.input.onSave;
        if (typeof callback !== 'function') {
          return {};
        }
        invokeConfinedCallback(
          () => callback(validation.value),
          (outcome) =>
            settleParentCallback(invocationId, 'save', outcome, (settlement) =>
              self.send(settlement)
            )
        );
        return { nextInvocationId: invocationId + 1 };
      }),
      invokeCancel: assign(({ context, self }) => {
        const callback = context.input.onCancelEdit;
        if (typeof callback !== 'function') {
          return {};
        }
        const invocationId = context.nextInvocationId;
        invokeConfinedCallback(callback, (outcome) =>
          settleParentCallback(invocationId, 'cancel', outcome, (event) => self.send(event))
        );
        return { nextInvocationId: invocationId + 1 };
      }),
      recordSettlement: assign(({ context, event, self }) => {
        if (
          event.type !== INTERNAL_CALLBACK_SETTLED ||
          event.authority !== settlementAuthority ||
          context.settledInvocationIds.has(event.invocationId)
        ) {
          return {};
        }
        const settledInvocationIds = new Set(context.settledInvocationIds);
        settledInvocationIds.add(event.invocationId);
        const settlementRecords = new Map(context.settlementRecords);
        settlementRecords.set(
          event.invocationId,
          Object.freeze({
            invocationId: event.invocationId,
            intentKind: event.intentKind,
            outcome: event.outcome,
            consumed: false,
          })
        );
        queueMicrotask(() =>
          self.send(
            event.outcome === 'fulfilled'
              ? {
                  type: 'PARENT_CALLBACK_FULFILLED',
                  invocationId: event.invocationId,
                  intentKind: event.intentKind,
                }
              : {
                  type: 'PARENT_CALLBACK_FAILED',
                  invocationId: event.invocationId,
                  intentKind: event.intentKind,
                  failureKind: event.outcome,
                }
          )
        );
        return { settledInvocationIds, settlementRecords };
      }),
      consumeSettlement: assign(({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        if (
          decoded?.type !== 'PARENT_CALLBACK_FULFILLED' &&
          decoded?.type !== 'PARENT_CALLBACK_FAILED'
        ) {
          return {};
        }
        const outcome: CallbackOutcome =
          decoded.type === 'PARENT_CALLBACK_FULFILLED' ? 'fulfilled' : decoded.failureKind;
        const current = context.settlementRecords.get(decoded.invocationId);
        if (
          current === undefined ||
          current.intentKind !== decoded.intentKind ||
          current.outcome !== outcome ||
          current.consumed
        ) {
          return {};
        }
        const records = new Map(context.settlementRecords);
        records.set(decoded.invocationId, Object.freeze({ ...current, consumed: true }));
        const diagnostics = new Map(context.settlementDiagnostics);
        diagnostics.set(
          decoded.invocationId,
          Object.freeze({
            code: callbackDiagnostic(outcome),
            key: `${context.instanceSuffix}:${decoded.invocationId}:${decoded.intentKind}:${outcome}`,
          })
        );
        return { settlementRecords: records, settlementDiagnostics: diagnostics };
      }),
      destroy: assign(({ context, event }) => {
        const decoded = decodedMachineEvent(event);
        return decoded?.type === 'COMPONENT_DESTROYED'
          ? destroyContext(context, decoded.ownsFocus)
          : {};
      }),
    },
  }).createMachine({
    id: 'cvExperienceCardAccessibility',
    initial: 'initializing',
    context: initialContext,
    on: {
      [INTERNAL_INVALID_EXTERNAL_EVENT]: [
        { guard: 'authorizedInvalidExternalEvent', actions: 'rejectUiIntent' },
        {},
      ],
      [INTERNAL_CALLBACK_SETTLED]: [
        { guard: 'authorizedInternalSettlement', actions: 'recordSettlement' },
        {},
      ],
      EXPERIENCE_INPUT_CHANGED: [
        {
          guard: 'inputChangePreservesState',
          actions: 'replaceInputPreservingState',
        },
        {
          guard: 'nextInputEditing',
          target: '.editing',
          actions: 'replaceInputAndClassify',
        },
        {
          guard: 'nextInputDisplay',
          target: '.display.collapsed',
          actions: 'replaceInputAndClassify',
        },
        {
          guard: 'validInputEvent',
          target: '.unavailable',
          actions: 'replaceInputAndClassify',
        },
        { actions: 'rejectUiIntent' },
      ],
      EXPERIENCE_PRESENTATION_CHANGED: [
        { guard: 'validInputEvent', actions: 'replaceInputPreservingState' },
        { actions: 'rejectUiIntent' },
      ],
      CALLBACK_REFERENCE_CHANGED: [
        { guard: 'validInputEvent', actions: 'replaceInputPreservingState' },
        { actions: 'rejectUiIntent' },
      ],
      PARENT_CALLBACK_FULFILLED: [
        { guard: 'currentSettlementEvent', actions: 'consumeSettlement' },
        { actions: 'rejectUiIntent' },
      ],
      PARENT_CALLBACK_FAILED: [
        { guard: 'currentSettlementEvent', actions: 'consumeSettlement' },
        { actions: 'rejectUiIntent' },
      ],
      COMPONENT_DESTROYED: [
        { guard: 'validDestroyEvent', target: '.terminal', actions: 'destroy' },
        { actions: 'rejectUiIntent' },
      ],
      TOGGLE_REQUESTED: { actions: 'rejectUiIntent' },
      EDIT_REQUESTED: { actions: 'rejectUiIntent' },
      DELETE_REQUESTED: { actions: 'rejectUiIntent' },
      EDIT_SAVE_REQUESTED: { actions: 'rejectUiIntent' },
      EDIT_CANCEL_REQUESTED: { actions: 'rejectUiIntent' },
      '*': { actions: 'rejectUiIntent' },
    },
    states: {
      initializing: {
        entry: ['reportIdentityDiagnostic', 'reportInitialInputDiagnostic'],
        always: [
          { guard: 'initiallyEditing', target: 'editing' },
          { guard: 'initiallyDisplay', target: 'display' },
          { target: 'unavailable' },
        ],
      },
      display: {
        initial: 'collapsed',
        on: {
          EDIT_REQUESTED: { guard: 'canEditDisplay', actions: 'invokeEdit' },
          DELETE_REQUESTED: { guard: 'canDeleteDisplay', actions: 'invokeDelete' },
        },
        states: {
          collapsed: {
            on: {
              TOGGLE_REQUESTED: {
                guard: 'ownToggle',
                target: 'expanded',
                actions: 'expand',
              },
            },
          },
          expanded: {
            on: {
              TOGGLE_REQUESTED: {
                guard: 'ownToggle',
                target: 'collapsed',
                actions: 'collapse',
              },
            },
          },
        },
      },
      editing: {
        on: {
          EDIT_SAVE_REQUESTED: [
            { guard: 'canSave', actions: 'handleSaveIntent' },
            { actions: 'rejectUiIntent' },
          ],
          EDIT_CANCEL_REQUESTED: { guard: 'canCancel', actions: 'invokeCancel' },
        },
      },
      unavailable: {
        on: {
          EDIT_REQUESTED: { guard: 'canEditUnavailable', actions: 'invokeEdit' },
          DELETE_REQUESTED: { guard: 'canDeleteUnavailable', actions: 'invokeDelete' },
        },
      },
      terminal: {
        on: {
          [INTERNAL_INVALID_EXTERNAL_EVENT]: {},
          [INTERNAL_CALLBACK_SETTLED]: [
            { guard: 'authorizedInternalSettlement', actions: 'recordSettlement' },
            {},
          ],
          EXPERIENCE_INPUT_CHANGED: {},
          EXPERIENCE_PRESENTATION_CHANGED: {},
          CALLBACK_REFERENCE_CHANGED: {},
          PARENT_CALLBACK_FULFILLED: [
            { guard: 'currentSettlementEvent', actions: 'consumeSettlement' },
            {},
          ],
          PARENT_CALLBACK_FAILED: [
            { guard: 'currentSettlementEvent', actions: 'consumeSettlement' },
            {},
          ],
          COMPONENT_DESTROYED: {},
          TOGGLE_REQUESTED: {},
          EDIT_REQUESTED: {},
          DELETE_REQUESTED: {},
          EDIT_SAVE_REQUESTED: {},
          EDIT_CANCEL_REQUESTED: {},
          '*': {},
        },
      },
    },
  });
}
