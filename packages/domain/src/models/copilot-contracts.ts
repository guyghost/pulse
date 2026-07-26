/**
 * Shared, provider-agnostic contracts for the Premium Copilot.
 *
 * These contracts deliberately contain no provider instructions and no
 * application-pipeline event. Provider output is data to review, never an
 * authority to mutate product state.
 */

export const COPILOT_OPERATION_KINDS = [
  'analysis',
  'pitch',
  'cover-message',
  'cv-summary',
  'tjm-coach',
] as const;

export type CopilotOperationKind = (typeof COPILOT_OPERATION_KINDS)[number];
export type CopilotArtifactKind = Exclude<CopilotOperationKind, 'analysis'>;
export type CopilotCreditCost = 0 | 1;

export const COPILOT_CREDIT_COSTS = {
  analysis: 0,
  pitch: 1,
  'cover-message': 1,
  'cv-summary': 1,
  'tjm-coach': 1,
} as const satisfies Record<CopilotOperationKind, CopilotCreditCost>;

export const COPILOT_MISSION_FIELD_ALLOWLIST = [
  'title',
  'description',
  'client',
  'stack',
  'location',
  'remoteMode',
  'duration',
  'startDate',
  'displayedTjm',
] as const;

export type CopilotMissionField = (typeof COPILOT_MISSION_FIELD_ALLOWLIST)[number];

export const COPILOT_PROFILE_FIELD_ALLOWLIST = [
  'jobTitle',
  'seniority',
  'location',
  'keywords',
  'stack',
  'tjmBounds',
] as const;

export type CopilotProfileField = (typeof COPILOT_PROFILE_FIELD_ALLOWLIST)[number];

export const MAX_COPILOT_MISSION_DESCRIPTION_CHARS = 20_000;
export const MAX_COPILOT_TEXT_CHARS = 8_000;
export const MAX_COPILOT_LIST_ITEMS = 24;
export const MAX_COPILOT_EVIDENCE_ITEMS = 24;
export const MAX_COPILOT_APPROVED_ARTIFACTS = 512;

export interface CopilotDisplayedTjm {
  min: number | null;
  max: number | null;
  currency: 'EUR';
}

export interface CopilotTjmBounds {
  min: number;
  target: number;
  max: number;
  currency: 'EUR';
}

export interface CopilotMissionData {
  title?: string;
  description?: string;
  client?: string | null;
  stack?: readonly string[];
  location?: string | null;
  remoteMode?: string | null;
  duration?: string | null;
  startDate?: string | null;
  displayedTjm?: CopilotDisplayedTjm | null;
}

export interface CopilotProfileData {
  jobTitle?: string;
  seniority?: string;
  location?: string | null;
  keywords?: readonly string[];
  stack?: readonly string[];
  tjmBounds?: CopilotTjmBounds | null;
}

export interface CopilotExperienceEvidence {
  evidenceId: string;
  role: string;
  company: string | null;
  summary: string;
  skills: readonly string[];
}

export interface CopilotConsentSelection {
  missionFields: readonly CopilotMissionField[];
  profileFields: readonly CopilotProfileField[];
  evidenceIds: readonly string[];
}

export interface CopilotTransmittedPayload {
  mission: CopilotMissionData;
  profile: CopilotProfileData;
  experienceEvidence: readonly CopilotExperienceEvidence[];
}

/** Deterministic local observations for TJM coaching, never a recommendation. */
export interface CopilotTjmCoachFacts {
  schemaVersion: 1;
  confidence: 'insufficient' | 'low' | 'medium' | 'high';
  missionDisplayedTjm: number | null;
  profileBounds: {
    min: number;
    target: number;
    max: number;
    currency: 'EUR';
  };
  market: {
    matchedStacks: readonly string[];
    recordCount: number;
    sampleCount: number;
    min: number | null;
    weightedAverage: number | null;
    max: number | null;
    trend: 'up' | 'stable' | 'down';
    lastObservedAt: string | null;
  };
}

export interface CopilotEvidenceClaim {
  text: string;
  evidenceIds: readonly string[];
}

export const COPILOT_TJM_FACT_IDS = [
  'mission-displayed-tjm',
  'profile-tjm-bounds',
  'market-matched-stacks',
  'market-sample',
  'market-range',
  'market-trend',
  'market-last-observed',
] as const;

export type CopilotTjmFactId = (typeof COPILOT_TJM_FACT_IDS)[number];

export type CopilotSourceRef =
  | { kind: 'experience'; id: string; quote: string }
  | { kind: 'mission-field'; id: CopilotMissionField; quote: string }
  | { kind: 'profile-field'; id: CopilotProfileField; quote: string }
  | { kind: 'tjm-fact'; id: CopilotTjmFactId; quote: string };

export interface CopilotGroundingContext {
  payload: CopilotTransmittedPayload;
  tjmFacts: CopilotTjmCoachFacts | null;
}

export interface CopilotDraftSegment {
  text: string;
  sourceRefs: readonly CopilotSourceRef[];
}

export interface CopilotValidatedResult {
  schemaVersion: 1;
  kind: CopilotOperationKind;
  evidenceClaims: readonly CopilotEvidenceClaim[];
  gaps: readonly string[];
  risks: readonly string[];
  questions: readonly string[];
  /** Required for artifacts and absent for analysis; no parallel free-form draft exists. */
  draftSegments?: readonly CopilotDraftSegment[];
}

const MISSION_FIELD_SET = new Set<string>(COPILOT_MISSION_FIELD_ALLOWLIST);
const PROFILE_FIELD_SET = new Set<string>(COPILOT_PROFILE_FIELD_ALLOWLIST);
const OPERATION_KIND_SET = new Set<string>(COPILOT_OPERATION_KINDS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoundedString(value: unknown, max = MAX_COPILOT_TEXT_CHARS): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isNullableBoundedString(value: unknown): boolean {
  return value === null || isBoundedString(value);
}

function isBoundedStringList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_COPILOT_LIST_ITEMS &&
    value.every((item) => isBoundedString(item))
  );
}

function hasUniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isTjmRate(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0 && value <= 5_000;
}

function normalizeSourceText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr');
}

function sourceLeafValues(value: unknown): readonly (string | number | boolean)[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [value];
  }
  if (Array.isArray(value)) return value.flatMap(sourceLeafValues);
  if (isRecord(value)) return Object.values(value).flatMap(sourceLeafValues);
  return [];
}

/**
 * Match only canonical source values, never serialized object keys or JSON
 * punctuation. Textual excerpts must be substantial; scalar values are exact.
 */
function sourceContainsSubstantialQuote(value: unknown, quote: string): boolean {
  const normalizedQuote = normalizeSourceText(quote);
  if (normalizedQuote.length === 0) return false;
  return sourceLeafValues(value).some((leaf) => {
    if (typeof leaf !== 'string') return normalizedQuote === String(leaf).toLocaleLowerCase('fr');
    return normalizedQuote.length >= 8 && normalizeSourceText(leaf).includes(normalizedQuote);
  });
}

function tjmFactValue(facts: CopilotTjmCoachFacts, id: CopilotTjmFactId): unknown {
  switch (id) {
    case 'mission-displayed-tjm':
      return facts.missionDisplayedTjm;
    case 'profile-tjm-bounds':
      return facts.profileBounds;
    case 'market-matched-stacks':
      return facts.market.matchedStacks;
    case 'market-sample':
      return { recordCount: facts.market.recordCount, sampleCount: facts.market.sampleCount };
    case 'market-range':
      return {
        min: facts.market.min,
        weightedAverage: facts.market.weightedAverage,
        max: facts.market.max,
      };
    case 'market-trend':
      return facts.market.trend;
    case 'market-last-observed':
      return facts.market.lastObservedAt;
  }
}

/** Canonical, value-only quote the provider must echo for one TJM fact. */
export function copilotTjmFactQuote(
  facts: CopilotTjmCoachFacts,
  id: CopilotTjmFactId
): string | null {
  const value = tjmFactValue(facts, id);
  switch (id) {
    case 'mission-displayed-tjm':
      return value === null ? null : String(value);
    case 'profile-tjm-bounds':
      return `${facts.profileBounds.min} / ${facts.profileBounds.target} / ${facts.profileBounds.max} ${facts.profileBounds.currency}`;
    case 'market-matched-stacks':
      return facts.market.matchedStacks.length > 0 ? facts.market.matchedStacks.join(', ') : null;
    case 'market-sample':
      return `${facts.market.recordCount} / ${facts.market.sampleCount}`;
    case 'market-range':
      return `${facts.market.min ?? 'null'} / ${facts.market.weightedAverage ?? 'null'} / ${facts.market.max ?? 'null'}`;
    case 'market-trend':
      return facts.market.trend;
    case 'market-last-observed':
      return facts.market.lastObservedAt;
  }
}

function tjmFactHasCanonicalQuote(
  facts: CopilotTjmCoachFacts,
  id: CopilotTjmFactId,
  quote: string
): boolean {
  const canonical = copilotTjmFactQuote(facts, id);
  return canonical !== null && normalizeSourceText(quote) === normalizeSourceText(canonical);
}

/**
 * Shared pure boundary for UI previews and server-side provider validation.
 * The reference must resolve to the exact source named by its typed ID.
 */
export function isCopilotSourceRefGrounded(
  sourceRef: CopilotSourceRef,
  grounding: CopilotGroundingContext,
  suppliedEvidenceIds: readonly string[],
  suppliedTjmFactIds: readonly CopilotTjmFactId[]
): boolean {
  const evidenceSet = new Set(suppliedEvidenceIds);
  const tjmFactSet = new Set<string>(suppliedTjmFactIds);
  if (sourceRef.kind === 'experience') {
    if (!evidenceSet.has(sourceRef.id)) return false;
    const evidence = grounding.payload.experienceEvidence.find(
      (item) => item.evidenceId === sourceRef.id
    );
    return (
      evidence !== undefined &&
      sourceContainsSubstantialQuote(
        [evidence.role, evidence.company, evidence.summary, evidence.skills],
        sourceRef.quote
      )
    );
  }
  if (sourceRef.kind === 'mission-field') {
    return (
      MISSION_FIELD_SET.has(sourceRef.id) &&
      Object.hasOwn(grounding.payload.mission, sourceRef.id) &&
      sourceContainsSubstantialQuote(grounding.payload.mission[sourceRef.id], sourceRef.quote)
    );
  }
  if (sourceRef.kind === 'profile-field') {
    return (
      PROFILE_FIELD_SET.has(sourceRef.id) &&
      Object.hasOwn(grounding.payload.profile, sourceRef.id) &&
      sourceContainsSubstantialQuote(grounding.payload.profile[sourceRef.id], sourceRef.quote)
    );
  }
  return (
    tjmFactSet.has(sourceRef.id) &&
    grounding.tjmFacts !== null &&
    tjmFactHasCanonicalQuote(grounding.tjmFacts, sourceRef.id, sourceRef.quote)
  );
}

function expectedTjmConfidence(sampleCount: number): CopilotTjmCoachFacts['confidence'] {
  if (sampleCount === 0) return 'insufficient';
  if (sampleCount < 5) return 'low';
  if (sampleCount < 20) return 'medium';
  return 'high';
}

export function isCopilotTjmCoachFacts(value: unknown): value is CopilotTjmCoachFacts {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      new Set(['schemaVersion', 'confidence', 'missionDisplayedTjm', 'profileBounds', 'market'])
    ) ||
    value.schemaVersion !== 1 ||
    !['insufficient', 'low', 'medium', 'high'].includes(String(value.confidence)) ||
    (value.missionDisplayedTjm !== null && !isTjmRate(value.missionDisplayedTjm)) ||
    !isRecord(value.profileBounds) ||
    !hasOnlyKeys(value.profileBounds, new Set(['min', 'target', 'max', 'currency'])) ||
    !isTjmRate(value.profileBounds.min) ||
    !isTjmRate(value.profileBounds.target) ||
    !isTjmRate(value.profileBounds.max) ||
    value.profileBounds.currency !== 'EUR' ||
    value.profileBounds.min > value.profileBounds.target ||
    value.profileBounds.target > value.profileBounds.max ||
    !isRecord(value.market) ||
    !hasOnlyKeys(
      value.market,
      new Set([
        'matchedStacks',
        'recordCount',
        'sampleCount',
        'min',
        'weightedAverage',
        'max',
        'trend',
        'lastObservedAt',
      ])
    ) ||
    !Array.isArray(value.market.matchedStacks) ||
    value.market.matchedStacks.length > 48 ||
    !value.market.matchedStacks.every(
      (stack): stack is string =>
        typeof stack === 'string' && stack.trim().length > 0 && stack.length <= 120
    ) ||
    !hasUniqueStrings(value.market.matchedStacks) ||
    !Number.isSafeInteger(value.market.recordCount) ||
    (value.market.recordCount as number) < 0 ||
    !Number.isSafeInteger(value.market.sampleCount) ||
    (value.market.sampleCount as number) < 0 ||
    !['up', 'stable', 'down'].includes(String(value.market.trend)) ||
    (value.market.lastObservedAt !== null &&
      (typeof value.market.lastObservedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.market.lastObservedAt)))
  ) {
    return false;
  }

  const recordCount = value.market.recordCount as number;
  const sampleCount = value.market.sampleCount as number;
  if (value.confidence !== expectedTjmConfidence(sampleCount)) return false;
  if (recordCount === 0) {
    return (
      sampleCount === 0 &&
      value.market.matchedStacks.length === 0 &&
      value.market.min === null &&
      value.market.weightedAverage === null &&
      value.market.max === null &&
      value.market.trend === 'stable' &&
      value.market.lastObservedAt === null
    );
  }
  return (
    sampleCount > 0 &&
    sampleCount >= recordCount &&
    value.market.matchedStacks.length > 0 &&
    value.market.lastObservedAt !== null &&
    isTjmRate(value.market.min) &&
    isTjmRate(value.market.weightedAverage) &&
    isTjmRate(value.market.max) &&
    value.market.min <= value.market.weightedAverage &&
    value.market.weightedAverage <= value.market.max
  );
}

function isMissionData(value: unknown): value is CopilotMissionData {
  if (!isRecord(value) || !hasOnlyKeys(value, MISSION_FIELD_SET)) return false;

  for (const [key, fieldValue] of Object.entries(value)) {
    switch (key as CopilotMissionField) {
      case 'title':
        if (!isBoundedString(fieldValue)) return false;
        break;
      case 'description':
        if (!isBoundedString(fieldValue, MAX_COPILOT_MISSION_DESCRIPTION_CHARS)) return false;
        break;
      case 'client':
      case 'location':
      case 'remoteMode':
      case 'duration':
      case 'startDate':
        if (!isNullableBoundedString(fieldValue)) return false;
        break;
      case 'stack':
        if (!isBoundedStringList(fieldValue)) return false;
        break;
      case 'displayedTjm': {
        if (fieldValue === null) break;
        if (
          !isRecord(fieldValue) ||
          !hasOnlyKeys(fieldValue, new Set(['min', 'max', 'currency'])) ||
          (fieldValue.min !== null && !isTjmRate(fieldValue.min)) ||
          (fieldValue.max !== null && !isTjmRate(fieldValue.max)) ||
          fieldValue.currency !== 'EUR' ||
          (typeof fieldValue.min === 'number' &&
            typeof fieldValue.max === 'number' &&
            fieldValue.min > fieldValue.max)
        ) {
          return false;
        }
        break;
      }
    }
  }

  return true;
}

function isProfileData(value: unknown): value is CopilotProfileData {
  if (!isRecord(value) || !hasOnlyKeys(value, PROFILE_FIELD_SET)) return false;

  for (const [key, fieldValue] of Object.entries(value)) {
    switch (key as CopilotProfileField) {
      case 'jobTitle':
      case 'seniority':
        if (!isBoundedString(fieldValue)) return false;
        break;
      case 'location':
        if (!isNullableBoundedString(fieldValue)) return false;
        break;
      case 'keywords':
      case 'stack':
        if (!isBoundedStringList(fieldValue)) return false;
        break;
      case 'tjmBounds': {
        if (fieldValue === null) break;
        if (
          !isRecord(fieldValue) ||
          !hasOnlyKeys(fieldValue, new Set(['min', 'target', 'max', 'currency'])) ||
          !isTjmRate(fieldValue.min) ||
          !isTjmRate(fieldValue.target) ||
          !isTjmRate(fieldValue.max) ||
          fieldValue.currency !== 'EUR' ||
          fieldValue.min > fieldValue.target ||
          fieldValue.target > fieldValue.max
        ) {
          return false;
        }
        break;
      }
    }
  }

  return true;
}

function isExperienceEvidence(value: unknown): value is CopilotExperienceEvidence {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, new Set(['evidenceId', 'role', 'company', 'summary', 'skills']))) {
    return false;
  }

  return (
    isBoundedString(value.evidenceId) &&
    isBoundedString(value.role) &&
    isNullableBoundedString(value.company) &&
    isBoundedString(value.summary) &&
    isBoundedStringList(value.skills)
  );
}

/**
 * Consent is invalid when it is empty, contains unknown values or contains
 * duplicates. The UI may choose any non-empty subset of the public allowlist.
 */
export function isValidCopilotConsentSelection(selection: CopilotConsentSelection): boolean {
  const missionFields = selection.missionFields as readonly string[];
  const profileFields = selection.profileFields as readonly string[];

  return (
    missionFields.length <= COPILOT_MISSION_FIELD_ALLOWLIST.length &&
    profileFields.length <= COPILOT_PROFILE_FIELD_ALLOWLIST.length &&
    selection.evidenceIds.length <= MAX_COPILOT_EVIDENCE_ITEMS &&
    missionFields.every((field) => MISSION_FIELD_SET.has(field)) &&
    profileFields.every((field) => PROFILE_FIELD_SET.has(field)) &&
    selection.evidenceIds.every((id) => isBoundedString(id)) &&
    hasUniqueStrings(missionFields) &&
    hasUniqueStrings(profileFields) &&
    hasUniqueStrings(selection.evidenceIds) &&
    missionFields.length + profileFields.length + selection.evidenceIds.length > 0
  );
}

/**
 * Canonical order used by the dossier model, persistence and request hashing.
 * Consent is represented as a set; callers must not depend on UI checkbox order.
 */
export function canonicalizeCopilotConsentSelection(
  selection: CopilotConsentSelection
): CopilotConsentSelection {
  const missionFields = new Set<string>(selection.missionFields);
  const profileFields = new Set<string>(selection.profileFields);
  return {
    missionFields: COPILOT_MISSION_FIELD_ALLOWLIST.filter((field) => missionFields.has(field)),
    profileFields: COPILOT_PROFILE_FIELD_ALLOWLIST.filter((field) => profileFields.has(field)),
    evidenceIds: [...selection.evidenceIds].sort((left, right) => left.localeCompare(right)),
  };
}

/** True when every field selected for one job is covered by dossier consent. */
export function isCopilotConsentSubset(
  selection: CopilotConsentSelection,
  cumulativeConsent: CopilotConsentSelection
): boolean {
  if (
    !isValidCopilotConsentSelection(selection) ||
    !isValidCopilotConsentSelection(cumulativeConsent)
  ) {
    return false;
  }
  const missionFields = new Set<string>(cumulativeConsent.missionFields);
  const profileFields = new Set<string>(cumulativeConsent.profileFields);
  const evidenceIds = new Set(cumulativeConsent.evidenceIds);
  return (
    selection.missionFields.every((field) => missionFields.has(field)) &&
    selection.profileFields.every((field) => profileFields.has(field)) &&
    selection.evidenceIds.every((id) => evidenceIds.has(id))
  );
}

/**
 * Monotonic dossier consent is the canonical union of all explicit selections.
 * A later job may transmit a strict subset without revoking prior consent.
 */
export function unionCopilotConsentSelections(
  current: CopilotConsentSelection,
  selection: CopilotConsentSelection
): CopilotConsentSelection {
  return canonicalizeCopilotConsentSelection({
    missionFields: [...new Set([...current.missionFields, ...selection.missionFields])],
    profileFields: [...new Set([...current.profileFields, ...selection.profileFields])],
    evidenceIds: [...new Set([...current.evidenceIds, ...selection.evidenceIds])],
  });
}

/**
 * Runtime boundary check for the exact payload leaving the local-first client.
 * Unknown/raw fields are rejected and every transmitted field must have been
 * explicitly consented to.
 */
export function isCopilotTransmissionAllowed(
  value: unknown,
  consent: CopilotConsentSelection
): value is CopilotTransmittedPayload {
  if (!isValidCopilotConsentSelection(consent) || !isRecord(value)) return false;
  if (!hasOnlyKeys(value, new Set(['mission', 'profile', 'experienceEvidence']))) return false;
  if (!isMissionData(value.mission) || !isProfileData(value.profile)) return false;
  if (
    !Array.isArray(value.experienceEvidence) ||
    value.experienceEvidence.length > MAX_COPILOT_EVIDENCE_ITEMS ||
    !value.experienceEvidence.every(isExperienceEvidence)
  ) {
    return false;
  }

  const consentedMissionFields = new Set<string>(consent.missionFields);
  const consentedProfileFields = new Set<string>(consent.profileFields);
  const consentedEvidenceIds = new Set(consent.evidenceIds);
  const transmittedEvidenceIds = value.experienceEvidence.map((item) => item.evidenceId);

  return (
    Object.keys(value.mission).every((field) => consentedMissionFields.has(field)) &&
    Object.keys(value.profile).every((field) => consentedProfileFields.has(field)) &&
    transmittedEvidenceIds.every((id) => consentedEvidenceIds.has(id)) &&
    hasUniqueStrings(transmittedEvidenceIds)
  );
}

/**
 * Independent runtime guard applied after provider/schema parsing and before a
 * result may enter a review state.
 */
export function isReviewableCopilotResult(
  value: unknown,
  expectedKind: CopilotOperationKind,
  suppliedEvidenceIds: readonly string[],
  suppliedTjmFactIds: readonly CopilotTjmFactId[] = [],
  grounding: CopilotGroundingContext | null = null
): value is CopilotValidatedResult {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(
      value,
      new Set([
        'schemaVersion',
        'kind',
        'evidenceClaims',
        'gaps',
        'risks',
        'questions',
        'draftSegments',
      ])
    ) ||
    value.schemaVersion !== 1 ||
    typeof value.kind !== 'string' ||
    !OPERATION_KIND_SET.has(value.kind) ||
    value.kind !== expectedKind ||
    !isBoundedStringList(value.gaps) ||
    !isBoundedStringList(value.risks) ||
    !isBoundedStringList(value.questions) ||
    !Array.isArray(value.evidenceClaims) ||
    value.evidenceClaims.length > MAX_COPILOT_LIST_ITEMS
  ) {
    return false;
  }

  const draftSegments = value.draftSegments;
  if (expectedKind === 'analysis') {
    if (draftSegments !== undefined) return false;
  } else if (
    !Array.isArray(draftSegments) ||
    draftSegments.length === 0 ||
    draftSegments.length > MAX_COPILOT_LIST_ITEMS
  ) {
    return false;
  }

  const evidenceSet = new Set(suppliedEvidenceIds);
  const claimsValid = value.evidenceClaims.every((claim) => {
    if (!isRecord(claim) || !hasOnlyKeys(claim, new Set(['text', 'evidenceIds']))) return false;
    if (!isBoundedString(claim.text) || !Array.isArray(claim.evidenceIds)) return false;
    if (
      claim.evidenceIds.length === 0 ||
      claim.evidenceIds.length > MAX_COPILOT_EVIDENCE_ITEMS ||
      !claim.evidenceIds.every((id) => typeof id === 'string') ||
      !hasUniqueStrings(claim.evidenceIds)
    ) {
      return false;
    }

    return claim.evidenceIds.every((id) => evidenceSet.has(id));
  });
  if (!claimsValid) return false;

  if (expectedKind === 'analysis') return true;
  if (grounding === null) return false;
  let hasExperienceRef = false;
  let hasTjmFactRef = false;
  const valid = (draftSegments as unknown[]).every((segment) => {
    if (!isRecord(segment) || !hasOnlyKeys(segment, new Set(['text', 'sourceRefs']))) {
      return false;
    }
    if (
      !isBoundedString(segment.text) ||
      !Array.isArray(segment.sourceRefs) ||
      segment.sourceRefs.length === 0 ||
      segment.sourceRefs.length > MAX_COPILOT_EVIDENCE_ITEMS
    ) {
      return false;
    }
    const canonicalRefs = new Set<string>();
    for (const sourceRef of segment.sourceRefs) {
      if (
        !isRecord(sourceRef) ||
        !hasOnlyKeys(sourceRef, new Set(['kind', 'id', 'quote'])) ||
        typeof sourceRef.id !== 'string' ||
        !isBoundedString(sourceRef.quote)
      ) {
        return false;
      }
      if (sourceRef.kind === 'tjm-fact' && expectedKind !== 'tjm-coach') return false;
      if (
        !['experience', 'mission-field', 'profile-field', 'tjm-fact'].includes(
          String(sourceRef.kind)
        ) ||
        !isCopilotSourceRefGrounded(
          sourceRef as unknown as CopilotSourceRef,
          grounding,
          suppliedEvidenceIds,
          suppliedTjmFactIds
        )
      ) {
        return false;
      }
      if (sourceRef.kind === 'experience') {
        hasExperienceRef = true;
      } else if (sourceRef.kind === 'tjm-fact') {
        hasTjmFactRef = true;
      }
      const key = `${sourceRef.kind}:${sourceRef.id}`;
      if (canonicalRefs.has(key)) return false;
      canonicalRefs.add(key);
    }
    return true;
  });
  if (!valid) return false;
  return expectedKind === 'tjm-coach' ? hasTjmFactRef : hasExperienceRef;
}

export function copilotTjmFactIds(facts: CopilotTjmCoachFacts | null): CopilotTjmFactId[] {
  if (facts === null) return [];
  const ids: CopilotTjmFactId[] = ['profile-tjm-bounds', 'market-sample', 'market-trend'];
  if (facts.missionDisplayedTjm !== null) ids.push('mission-displayed-tjm');
  if (facts.market.matchedStacks.length > 0) ids.push('market-matched-stacks');
  if (facts.market.min !== null) ids.push('market-range');
  if (facts.market.lastObservedAt !== null) ids.push('market-last-observed');
  return ids;
}

export function renderCopilotDraft(result: CopilotValidatedResult): string | null {
  return result.kind === 'analysis'
    ? null
    : (result.draftSegments ?? []).map((segment) => segment.text).join('\n\n');
}

export function copilotCreditCost(kind: CopilotOperationKind): CopilotCreditCost {
  return COPILOT_CREDIT_COSTS[kind];
}
