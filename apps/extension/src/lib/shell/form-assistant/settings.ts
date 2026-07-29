/**
 * Form Assistant settings — isolated persistence.
 *
 * Volontairement séparé du contract AppSettings (qui touche la migration
 * settings-release et 7 fichiers) : le Form Assistant est une feature Phase 1
 * autonome, son réglage vit sous sa propre clé chrome.storage.local.
 *
 * Shell module : I/O (chrome.storage). Aucune logique métier.
 * Source de vérité : src/models/form-assistant.model.md.
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
