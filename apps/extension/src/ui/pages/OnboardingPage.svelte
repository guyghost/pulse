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

  async function handleSaveAlertPreferences(preferences: ConnectedAlertPreferences) {
    isSavingAlertPreferences = true;
    try {
      alertPreferences = await saveAlertPreferences(preferences);
      await showToast('Première alerte créée', 'success');
    } catch {
      await showToast("Impossible d'enregistrer l'alerte", 'error');
    } finally {
      isSavingAlertPreferences = false;
    }
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
