/**
 * Generation types — pure types for LLM-generated assets.
 *
 * Defines the different types of content that can be generated
 * for a mission (pitch, cover message, CV summary).
 */

/**
 * Type of generated content.
 */
export type GenerationType = 'pitch' | 'cover-message' | 'cv-summary';

/**
 * A generated asset stored in the system.
 */
export interface GeneratedAsset {
  readonly id: string;
  readonly missionId: string;
  readonly type: GenerationType;
  readonly content: string;
  readonly createdAt: number; // epoch ms
  readonly modelUsed: string; // e.g. 'gemini-nano', 'unknown'
}

/**
 * Human-readable labels for generation types.
 */
export const GENERATION_TYPE_LABELS: Record<GenerationType, string> = {
  pitch: 'Pitch candidature',
  'cover-message': 'Message recruteur',
  'cv-summary': 'Résumé CV adapté',
};

/**
 * Icons for generation types (uses Icon component name).
 */
export const GENERATION_TYPE_ICONS: Record<GenerationType, string> = {
  pitch: 'message-square',
  'cover-message': 'mail',
  'cv-summary': 'file-text',
};
