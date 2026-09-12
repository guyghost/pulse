/**
 * Form Assistant settings — isolated persistence.
 *
 * Deliberately separate from the AppSettings contract (which touches the
 * settings-release migration and 7 files): the Form Assistant is a standalone
 * Phase 1 feature, its setting lives under its own chrome.storage.local key.
 *
 * Shell module: I/O (chrome.storage). No business logic.
 * Source of truth: src/models/form-assistant.model.md.
 */
import { z } from 'zod';

const STORAGE_KEY = 'formAssist';

const FormAssistSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  engine: z.enum(['local', 'remote']).default('local'),
});

export type FormAssistSettings = z.infer<typeof FormAssistSettingsSchema>;

export const DEFAULT_FORM_ASSIST_SETTINGS: FormAssistSettings = {
  enabled: false,
  engine: 'local',
};

export async function getFormAssistSettings(): Promise<FormAssistSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const parsed = FormAssistSettingsSchema.safeParse(result[STORAGE_KEY]);
  if (!parsed.success) {
    return { ...DEFAULT_FORM_ASSIST_SETTINGS };
  }
  return parsed.data;
}

export async function setFormAssistEnabled(enabled: boolean): Promise<FormAssistSettings> {
  const current = await getFormAssistSettings();
  const next: FormAssistSettings = { ...current, enabled };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
