/**
 * Types purs du Form Assistant (remplissage de champs type Grammarly).
 *
 * Règles (Core) :
 * - Aucune I/O, aucun `Date`, aucun random. Tout ce qui est non-déterministe
 *   est injecté par le Shell.
 * - FieldDescriptor ne contient JAMAIS d'identifiants DOM (id/name), la valeur
 *   d'autres champs, l'URL courante ou du HTML brut. Seules des métadonnées
 *   décrivant le champ sont conservées.
 *
 * Source de vérité : `src/models/form-assistant.model.md`.
 */

/** Catégorie sémantique d'un champ de formulaire. */
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

/** Type d'entrée DOM dont on a la maîtrise (pas de valeurs arbitraires). */
export type FieldInputType =
  'text' | 'textarea' | 'email' | 'tel' | 'url' | 'search' | 'contenteditable';

/**
 * Métadonnées brutes extraites du DOM par le content script, avant
 * sanitisation. Le Shell (content script) produit ces valeurs ; le Core
 * les valide/sanitise/classifie.
 */
export interface RawFieldInput {
  readonly label: string;
  readonly placeholder: string;
  readonly inputType: FieldInputType;
  readonly required: boolean;
}

/**
 * Descripteur de champ canonical : métadonnées sanit-isées + catégorie.
 * C'est l'unique représentation d'un champ qui franchit le bridge.
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

/** Préférence utilisateur pour le moteur de génération. */
export type EnginePreference = 'local' | 'remote';

/** Disponibilité du moteur local (Gemini Nano). */
export type AiAvailability = 'available' | 'after-download' | 'no';

/** Droit d'accès au moteur distant (Eve). Piloté par le serveur. */
export type EntitlementState = 'active' | 'inactive';

/** Consentement session pour l'appel à Eve (aucun consentement ⇒ pas d'appel). */
export type ConsentState = 'unknown' | 'granted' | 'denied';

/**
 * Décision du sélecteur de moteur (Machine B). Soit un moteur effectif,
 * soit `none` quand aucun chemin n'est disponible (Gemini Nano absent/non
 * téléchargé ET Eve non autorisé).
 */
export type EngineSelection =
  | { readonly engine: 'local' }
  | { readonly engine: 'remote' }
  | { readonly engine: 'none'; readonly reason: 'unavailable' };

/**
 * Requête envoyée à Eve (Phase 2). Le profil est une projection allowlistée :
 * seuls les champs professionnels non-PII transitent (jamais d'email/téléphone).
 */
export interface RemoteFieldRequest {
  readonly kind: FieldKind;
  readonly label: string;
  readonly placeholder: string;
  readonly inputType: FieldInputType;
  readonly required: boolean;
  readonly profile: Readonly<Record<string, string | string[]>>;
}
