/**
 * Pure types for the Form Assistant (Grammarly-style field filling).
 *
 * Rules (Core):
 * - No I/O, no `Date`, no randomness. Everything non-deterministic is
 *   injected by the Shell.
 * - FieldDescriptor NEVER contains DOM identifiers (id/name), other fields'
 *   values, the current URL, or raw HTML. Only metadata describing the field
 *   is kept.
 *
 * Source of truth: `src/models/form-assistant.model.md`.
 */

/** Semantic category of a form field. */
export type FieldKind =
  | 'first-name'
  | 'last-name'
  | 'full-name'
  | 'email'
  | 'phone'
  | 'linkedin'
  | 'cover-letter'
  | 'availability'
  | 'tjm'
  | 'skill'
  | 'address'
  | 'job-title'
  | 'free-text';

/** DOM input type we fully control (no arbitrary values). */
export type FieldInputType =
  'text' | 'textarea' | 'email' | 'tel' | 'url' | 'search' | 'contenteditable';

/**
 * Raw metadata extracted from the DOM by the content script, before
 * sanitization. The Shell (content script) produces these values; the Core
 * les valide/sanitise/classifie.
 */
export interface RawFieldInput {
  readonly label: string;
  readonly placeholder: string;
  readonly inputType: FieldInputType;
  readonly required: boolean;
}

/**
 * Canonical field descriptor: sanitized metadata + category.
 * This is the only field representation that crosses the bridge.
 */
export interface FieldDescriptor {
  readonly kind: FieldKind;
  readonly label: string;
  readonly placeholder: string;
  readonly inputType: FieldInputType;
  readonly required: boolean;
}

/** Proposition de valeur pour un champ. */
export interface FieldProposal {
  readonly text: string;
}

/** User preference for the generation engine. */
export type EnginePreference = 'local' | 'remote';

/** Local engine availability (Gemini Nano). */
export type AiAvailability = 'available' | 'after-download' | 'no';

/** Remote engine entitlement (Eve). Server-driven. */
export type EntitlementState = 'active' | 'inactive';

/** Session consent for calling Eve (no consent ⇒ no call). */
export type ConsentState = 'unknown' | 'granted' | 'denied';

/**
 * Engine selector decision (Machine B). Either an effective engine, or `none`
 * when no path is available (Gemini Nano absent/not downloaded AND Eve not
 * entitled).
 */
export type EngineSelection =
  | { readonly engine: 'local' }
  | { readonly engine: 'remote' }
  | { readonly engine: 'none'; readonly reason: 'unavailable' };

/**
 * Request sent to Eve (Phase 2). The profile is an allowlisted projection:
 * only non-PII professional fields transit (never email/phone).
 */
export interface RemoteFieldRequest {
  readonly kind: FieldKind;
  readonly label: string;
  readonly placeholder: string;
  readonly inputType: FieldInputType;
  readonly required: boolean;
  readonly profile: Readonly<Record<string, string | string[]>>;
}
