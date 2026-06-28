<script lang="ts">
  import OnboardingLayout from '../templates/OnboardingLayout.svelte';
  import OnboardingWizard from '../organisms/OnboardingWizard.svelte';
  import type { UserProfile } from '$lib/core/types/profile';
  import { getProfile, saveProfile as persistProfile } from '$lib/shell/facades/settings.facade';
  import { profileMachine } from '$lib/shell/machines/profile.machine';
  import { createSvelteActor } from '$lib/shell/state/xstate.svelte';
  import {
    DEFAULT_CONNECTED_ALERT_PREFERENCES,
    type ConnectedAlertPreferences,
  } from '$lib/core/types/alert-preferences';
  import {
    getAlertPreferences,
    saveAlertPreferences,
  } from '$lib/shell/facades/alert-preferences.facade';
  import { showToast } from '$lib/shell/notifications/toast-service';
  import { withProfileDefaults } from '$lib/core/profile/normalize-profile';

  const { onComplete, onSkip }: { onComplete?: () => void; onSkip?: () => void } = $props();

  const profileActor = createSvelteActor(profileMachine, {
    input: {
      deps: {
        loadProfile: getProfile,
        saveProfile: async (profile) => {
          await persistProfile(profile);
          return profile;
        },
      },
    },
  });

  const isSaving = $derived(profileActor.snapshot.matches('saving'));
  const hasError = $derived(profileActor.snapshot.matches('error'));
  const errorMessage = $derived(profileActor.snapshot.context.error);
  let alertPreferences = $state<ConnectedAlertPreferences>(DEFAULT_CONNECTED_ALERT_PREFERENCES);
  let isSavingAlertPreferences = $state(false);
  // Incremental profile updates from the wizard (stack add/remove, …). Kept in
  // a local draft and forwarded to the profile machine so partial data is not
  // silently dropped between steps (B-1).
  let profileDraft = $state<UserProfile>(withProfileDefaults({}));

  (async () => {
    alertPreferences = await getAlertPreferences();
  })().catch(() => {});

  async function handleComplete(profile: UserProfile) {
    try {
      await submitProfile(profile);
      onComplete?.();
    } catch {
      // The machine exposes the error state to the wizard.
    }
  }

  function handleRetry() {
    profileActor.send({ type: 'RETRY' });
  }

  // Returns true on success, false on failure so the wizard can stay on the
  // alert step and let the user retry (ONB-01).
  async function handleSaveAlertPreferences(
    preferences: ConnectedAlertPreferences
  ): Promise<boolean> {
    isSavingAlertPreferences = true;
    try {
      alertPreferences = await saveAlertPreferences(preferences);
      await showToast('Première alerte créée', 'success');
      return true;
    } catch {
      await showToast("Impossible d'enregistrer l'alerte", 'error');
      return false;
    } finally {
      isSavingAlertPreferences = false;
    }
  }

  // Propagates incremental wizard edits to the profile machine (the in-page
  // store) so they are not lost between steps (B-1).
  function handleUpdateProfile(partial: Partial<UserProfile>) {
    profileDraft = withProfileDefaults({ ...profileDraft, ...partial });
    profileActor.send({ type: 'PROFILE_UPDATED', profile: profileDraft });
  }

  function submitProfile(profile: UserProfile): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const unsubscribe = profileActor.subscribe((snapshot) => {
        if (settled) {
          return;
        }
        if (snapshot.matches('ready') && snapshot.context.current) {
          settled = true;
          unsubscribe();
          resolve();
        }
        if (snapshot.matches('error')) {
          settled = true;
          const message = snapshot.context.error ?? 'Erreur lors de la sauvegarde';
          unsubscribe();
          reject(new Error(message));
        }
      });

      profileActor.send({ type: 'SUBMIT_PROFILE', profile });
    });
  }
</script>

{#snippet wizardContent()}
  <OnboardingWizard
    onComplete={handleComplete}
    {onSkip}
    onUpdateProfile={handleUpdateProfile}
    onRetry={handleRetry}
    {isSaving}
    {hasError}
    {errorMessage}
    {alertPreferences}
    {isSavingAlertPreferences}
    onSaveAlertPreferences={handleSaveAlertPreferences}
  />
{/snippet}

<OnboardingLayout content={wizardContent} />
