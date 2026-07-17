import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const RELEASE_RUNTIME_FILES = [
  'src/background/index.ts',
  'src/lib/shell/scan/scanner.ts',
  'src/lib/shell/scan/rescore.ts',
  'src/lib/shell/notifications/notify-missions.ts',
  'src/lib/shell/notifications/daily-digest.ts',
];

describe('settings release static writer fence', () => {
  it.each(RELEASE_RUNTIME_FILES)(
    '%s has no legacy Settings/onboarding storage dependency',
    (file) => {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/storage\/chrome-storage['"].*getSettings/s);
      expect(source).not.toMatch(/storage\/first-scan['"].*OnboardingCompleted/s);
      expect(source).not.toContain('changes.settings || changes.onboarding_completed');
      expect(source).not.toContain("message.type === 'SAVE_SETTINGS'");
      expect(source).not.toContain("message.type === 'SET_ONBOARDING_COMPLETED'");
      expect(source).not.toContain("message.type === 'CLEAR_ONBOARDING_COMPLETED'");
    }
  );

  it('keeps permission prompts and global alarm clears outside the release actor', () => {
    const source = RELEASE_RUNTIME_FILES.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toContain('permissions.request');
    expect(source).not.toContain('alarms.clearAll');
  });

  it('keeps the unmodelled multi-store backup restore API out of the shipped Settings graph', () => {
    const state = readFileSync('src/lib/state/settings-page.svelte.ts', 'utf8');
    const page = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');
    for (const forbidden of [
      'parseBackupJson',
      'validateBackup',
      'restoreBackup(',
      'handleFileSelect(',
      'saveFavorites',
      'saveHidden',
      'BackupRestoreModal',
    ]) {
      expect(`${state}\n${page}`).not.toContain(forbidden);
    }
  });
});
