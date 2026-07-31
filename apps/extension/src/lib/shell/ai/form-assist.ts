import {
  applicationFormAssistMachine,
  canApplySuggestion,
  filterAllowedFormFields,
  type CapturedFormField,
  type FieldSuggestion,
  type SuggestionDecision,
} from '@pulse/domain';
import { createActor } from 'xstate';
import { z } from 'zod';
import { getProfile } from '../storage/db';
import {
  projectionHasPremiumFeature,
  refreshExtensionEntitlement,
} from '../account/account-connection';
import { generateFormFieldSuggestions } from './form-assist-worker-client';
import { INCLUDED_CONNECTOR_IDS } from '../connectors/build-config';

const FORM_ASSIST_SESSION_KEY = 'pulse_form_assist_session_v1';

const CapturedFieldSchema = z
  .object({
    fieldId: z.string().min(1).max(160),
    kind: z.enum(['text', 'textarea', 'email', 'tel', 'url', 'select']),
    label: z.string().max(500),
    value: z.string().max(10_000),
    autocomplete: z.string().max(160).nullable(),
  })
  .strict();

const SuggestionSchema = z
  .object({
    suggestionId: z.string().min(1).max(120),
    fieldId: z.string().min(1).max(160),
    proposedValue: z.string().max(4_000),
    confidence: z.number().min(0).max(1),
    rationale: z.string().max(500),
    sourceRefs: z.array(z.string().min(1).max(160)).max(8),
  })
  .strict();

const FormAssistSessionSchema = z
  .object({
    sessionId: z.string().uuid(),
    tabId: z.number().int().positive(),
    origin: z.string().url(),
    fingerprint: z.string().min(1).max(160),
    fields: z.array(CapturedFieldSchema).max(80),
    suggestions: z.array(SuggestionSchema).max(40),
  })
  .strict();

type FormAssistSession = z.infer<typeof FormAssistSessionSchema>;

export type FormAssistError =
  | 'CONSENT_REQUIRED'
  | 'ACCOUNT_REQUIRED'
  | 'PREMIUM_REQUIRED'
  | 'UNSUPPORTED_ORIGIN'
  | 'PERMISSION_DENIED'
  | 'NO_ACTIVE_TAB'
  | 'NO_PROFILE'
  | 'NO_SUPPORTED_FIELDS'
  | 'CAPTURE_FAILED'
  | 'AI_UNAVAILABLE'
  | 'AI_FAILED'
  | 'AI_OUTPUT_INVALID'
  | 'SESSION_EXPIRED'
  | 'FORM_CHANGED'
  | 'APPLY_FAILED'
  | 'MANUAL_REVIEW_REQUIRED';

export type FormAssistRequestResult =
  | {
      ok: true;
      state: 'reviewing';
      sessionId: string;
      origin: string;
      fields: CapturedFormField[];
      suggestions: FieldSuggestion[];
    }
  | { ok: false; state: string; error: FormAssistError };

export interface FormAssistDecision {
  suggestionId: string;
  decision: SuggestionDecision;
  editedValue?: string;
}

export type FormAssistApplyResult =
  | { ok: true; state: 'applied' | 'refused'; appliedCount: number }
  | { ok: false; state: string; error: FormAssistError };

interface PageCapture {
  origin: string;
  fingerprint: string;
  fields: CapturedFormField[];
}

const ASSIST_ORIGIN_RULES = [
  {
    connectorId: 'free-work',
    matches: (host: string) => host === 'www.free-work.com',
    permission: 'https://www.free-work.com/*',
  },
  {
    connectorId: 'lehibou',
    matches: (host: string) => host.endsWith('.lehibou.com'),
    permission: 'https://*.lehibou.com/*',
  },
  {
    connectorId: 'hiway',
    matches: (host: string) => host === 'hiway-missions.fr',
    permission: 'https://hiway-missions.fr/*',
  },
  {
    connectorId: 'collective',
    matches: (host: string) => host.endsWith('.collective.work'),
    permission: 'https://*.collective.work/*',
  },
  {
    connectorId: 'cherry-pick',
    matches: (host: string) => host === 'app.cherry-pick.io',
    permission: 'https://app.cherry-pick.io/*',
  },
  {
    connectorId: 'malt',
    matches: (host: string) => host.endsWith('.malt.fr'),
    permission: 'https://*.malt.fr/*',
  },
  {
    connectorId: 'malt',
    matches: (host: string) => host.endsWith('.malt.io'),
    permission: 'https://*.malt.io/*',
  },
] as const;

function applicationOriginPermission(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') {
      return null;
    }
    const rule = ASSIST_ORIGIN_RULES.find(
      (candidate) =>
        INCLUDED_CONNECTOR_IDS.includes(candidate.connectorId) && candidate.matches(url.hostname)
    );
    return rule?.permission ?? null;
  } catch {
    return null;
  }
}

export function isSupportedApplicationOrigin(rawUrl: string): boolean {
  return applicationOriginPermission(rawUrl) !== null;
}

function newAssistActorAtReview() {
  const actor = createActor(applicationFormAssistMachine);
  actor.start();
  actor.send({ type: 'ASSIST_REQUESTED' });
  actor.send({ type: 'CONSENT_APPROVED' });
  actor.send({ type: 'ACCESS_READY' });
  actor.send({ type: 'CAPTURE_SUCCEEDED' });
  actor.send({ type: 'SUGGESTIONS_VALIDATED' });
  return actor;
}

async function captureActiveForm(tabId: number): Promise<PageCapture | null> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      type FieldKind = 'text' | 'textarea' | 'email' | 'tel' | 'url' | 'select';
      const candidates = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          'input, textarea, select'
        )
      );
      const fields: Array<{
        fieldId: string;
        kind: FieldKind;
        label: string;
        value: string;
        autocomplete: string | null;
      }> = [];

      for (const element of candidates) {
        if (
          element.disabled ||
          ('readOnly' in element && element.readOnly) ||
          (element instanceof HTMLInputElement &&
            !['text', 'email', 'tel', 'url'].includes(element.type))
        ) {
          continue;
        }
        const kind: FieldKind =
          element instanceof HTMLTextAreaElement
            ? 'textarea'
            : element instanceof HTMLSelectElement
              ? 'select'
              : (element.type as 'text' | 'email' | 'tel' | 'url');
        const fieldId =
          element.dataset.missionpulseFieldId ??
          `pulse-field-${fields.length}-${element.name || element.id || kind}`;
        element.dataset.missionpulseFieldId = fieldId;
        const associatedLabel =
          element.labels?.[0]?.textContent ??
          element.getAttribute('aria-label') ??
          element.getAttribute('placeholder') ??
          element.getAttribute('name') ??
          '';
        fields.push({
          fieldId,
          kind,
          label: associatedLabel.trim().slice(0, 500),
          value: element.value.slice(0, 10_000),
          autocomplete: element.getAttribute('autocomplete')?.slice(0, 160) ?? null,
        });
      }

      const fingerprintInput = fields
        .map((field) => `${field.fieldId}:${field.kind}:${field.value}`)
        .join('|');
      let hash = 2166136261;
      for (let index = 0; index < fingerprintInput.length; index += 1) {
        hash ^= fingerprintInput.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return {
        origin: window.location.origin,
        fingerprint: `fnv1a-${(hash >>> 0).toString(16)}`,
        fields,
      };
    },
  });
  const result = results[0]?.result;
  const parsed = z
    .object({
      origin: z.string().url(),
      fingerprint: z.string(),
      fields: z.array(CapturedFieldSchema).max(80),
    })
    .strict()
    .safeParse(result);
  return parsed.success ? parsed.data : null;
}

async function readSession(): Promise<FormAssistSession | null> {
  const stored = await chrome.storage.session.get(FORM_ASSIST_SESSION_KEY);
  const parsed = FormAssistSessionSchema.safeParse(stored[FORM_ASSIST_SESSION_KEY]);
  return parsed.success ? parsed.data : null;
}

async function clearSession(): Promise<void> {
  await chrome.storage.session.remove(FORM_ASSIST_SESSION_KEY);
}

export async function requestApplicationFormAssist(
  consentApproved: boolean,
  nowMs: number
): Promise<FormAssistRequestResult> {
  const actor = createActor(applicationFormAssistMachine);
  actor.start();
  actor.send({ type: 'ASSIST_REQUESTED' });
  if (!consentApproved) {
    actor.send({ type: 'CONSENT_REFUSED' });
    return { ok: false, state: String(actor.getSnapshot().value), error: 'CONSENT_REQUIRED' };
  }
  actor.send({ type: 'CONSENT_APPROVED' });

  const account = await refreshExtensionEntitlement();
  if (account.accountId === null) {
    actor.send({ type: 'ACCOUNT_INACTIVE' });
    return { ok: false, state: String(actor.getSnapshot().value), error: 'ACCOUNT_REQUIRED' };
  }
  if (!projectionHasPremiumFeature(account, 'application_form_ai_assistance', nowMs)) {
    actor.send({ type: 'PREMIUM_MISSING' });
    return { ok: false, state: String(actor.getSnapshot().value), error: 'PREMIUM_REQUIRED' };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== 'number' || typeof tab.url !== 'string') {
    actor.send({ type: 'CAPTURE_FAILED_TERMINAL' });
    return { ok: false, state: String(actor.getSnapshot().value), error: 'NO_ACTIVE_TAB' };
  }
  const originPermission = applicationOriginPermission(tab.url);
  if (originPermission === null) {
    actor.send({ type: 'ORIGIN_UNSUPPORTED' });
    return { ok: false, state: String(actor.getSnapshot().value), error: 'UNSUPPORTED_ORIGIN' };
  }
  const hasPermission = await chrome.permissions
    .contains({ origins: [originPermission] })
    .catch(() => false);
  if (!hasPermission) {
    actor.send({ type: 'PERMISSION_MISSING' });
    actor.send({ type: 'REQUEST_PERMISSION' });
    const granted = await chrome.permissions
      .request({ origins: [originPermission] })
      .catch(() => false);
    actor.send({ type: granted ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED' });
    if (!granted) {
      return {
        ok: false,
        state: String(actor.getSnapshot().value),
        error: 'PERMISSION_DENIED',
      };
    }
  }
  actor.send({ type: 'ACCESS_READY' });

  const captured = await captureActiveForm(tab.id).catch(() => null);
  if (captured === null) {
    actor.send({ type: 'CAPTURE_FAILED_RETRYABLE' });
    return { ok: false, state: String(actor.getSnapshot().value), error: 'CAPTURE_FAILED' };
  }
  const fields = filterAllowedFormFields(captured.fields);
  if (fields.length === 0) {
    actor.send({ type: 'CAPTURE_FAILED_TERMINAL' });
    return { ok: false, state: String(actor.getSnapshot().value), error: 'NO_SUPPORTED_FIELDS' };
  }
  actor.send({ type: 'CAPTURE_SUCCEEDED' });

  const profile = await getProfile();
  if (profile === null) {
    actor.send({ type: 'SUGGESTIONS_REJECTED_TERMINAL' });
    return { ok: false, state: String(actor.getSnapshot().value), error: 'NO_PROFILE' };
  }
  const generated = await generateFormFieldSuggestions(fields, profile);
  if (!generated.ok) {
    actor.send({
      type:
        generated.error === 'AI_OUTPUT_INVALID'
          ? 'SUGGESTIONS_REJECTED_TERMINAL'
          : 'SUGGESTIONS_REJECTED_RETRYABLE',
    });
    return { ok: false, state: String(actor.getSnapshot().value), error: generated.error };
  }
  actor.send({ type: 'SUGGESTIONS_VALIDATED' });

  const session: FormAssistSession = {
    sessionId: crypto.randomUUID(),
    tabId: tab.id,
    origin: captured.origin,
    fingerprint: captured.fingerprint,
    fields,
    suggestions: generated.suggestions,
  };
  await chrome.storage.session.set({ [FORM_ASSIST_SESSION_KEY]: session });
  return {
    ok: true,
    state: 'reviewing',
    sessionId: session.sessionId,
    origin: session.origin,
    fields,
    suggestions: generated.suggestions,
  };
}

export async function applyApplicationFormAssist(
  sessionId: string,
  decisions: readonly FormAssistDecision[]
): Promise<FormAssistApplyResult> {
  const session = await readSession();
  if (session === null || session.sessionId !== sessionId) {
    return { ok: false, state: 'failed_terminal', error: 'SESSION_EXPIRED' };
  }
  const actor = newAssistActorAtReview();
  actor.send({ type: 'REVIEW_UPDATED' });

  const decisionsById = new Map(decisions.map((decision) => [decision.suggestionId, decision]));
  const allowedFieldIds = session.fields.map((field) => field.fieldId);
  const approved = session.suggestions.flatMap((suggestion) => {
    const decision = decisionsById.get(suggestion.suggestionId);
    if (
      decision === undefined ||
      !canApplySuggestion({
        suggestion,
        decision: decision.decision,
        allowedFieldIds,
      })
    ) {
      return [];
    }
    return [
      {
        fieldId: suggestion.fieldId,
        proposedValue:
          decision.decision === 'approved_edited' && decision.editedValue !== undefined
            ? decision.editedValue
            : suggestion.proposedValue,
      },
    ];
  });
  if (approved.length === 0) {
    actor.send({ type: 'REFUSE_ALL' });
    await clearSession();
    return { ok: true, state: 'refused', appliedCount: 0 };
  }

  actor.send({ type: 'APPLY_APPROVED_REQUESTED' });
  const recaptured = await captureActiveForm(session.tabId).catch(() => null);
  if (recaptured === null || recaptured.fingerprint !== session.fingerprint) {
    actor.send({ type: 'FORM_CHANGED' });
    return { ok: false, state: String(actor.getSnapshot().value), error: 'FORM_CHANGED' };
  }
  actor.send({ type: 'FORM_UNCHANGED' });

  const results = await chrome.scripting
    .executeScript({
      target: { tabId: session.tabId },
      args: [approved],
      func: (
        values: Array<{ fieldId: string; proposedValue: string }>
      ): { ok: boolean; appliedCount: number; rolledBack: boolean } => {
        const changed: Array<{
          element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
          previous: string;
        }> = [];
        try {
          for (const value of values) {
            const element = document.querySelector<
              HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
            >(`[data-missionpulse-field-id="${CSS.escape(value.fieldId)}"]`);
            if (!element || element.disabled || ('readOnly' in element && element.readOnly)) {
              throw new Error('field_unavailable');
            }
            changed.push({ element, previous: element.value });
            element.value = value.proposedValue;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return { ok: true, appliedCount: changed.length, rolledBack: false };
        } catch {
          let rolledBack = true;
          for (const item of changed.reverse()) {
            try {
              item.element.value = item.previous;
              item.element.dispatchEvent(new Event('input', { bubbles: true }));
              item.element.dispatchEvent(new Event('change', { bubbles: true }));
            } catch {
              rolledBack = false;
            }
          }
          return { ok: false, appliedCount: 0, rolledBack };
        }
      },
    })
    .catch(() => []);

  const outcome = results[0]?.result;
  if (outcome?.ok) {
    actor.send({ type: 'APPLY_SUCCEEDED' });
    await clearSession();
    return { ok: true, state: 'applied', appliedCount: outcome.appliedCount };
  }
  if (outcome?.rolledBack) {
    actor.send({ type: 'APPLY_FAILED_ROLLED_BACK' });
    return { ok: false, state: String(actor.getSnapshot().value), error: 'APPLY_FAILED' };
  }
  actor.send({ type: 'APPLY_FAILED_ROLLBACK_UNCERTAIN' });
  await clearSession();
  return {
    ok: false,
    state: String(actor.getSnapshot().value),
    error: 'MANUAL_REVIEW_REQUIRED',
  };
}
