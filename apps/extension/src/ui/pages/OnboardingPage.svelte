<script lang="ts">
  import OnboardingLayout from '../templates/OnboardingLayout.svelte';
  import OnboardingWizard from '../organisms/OnboardingWizard.svelte';
  import type { UserProfile } from '$lib/core/types/profile';
  import { saveProfile } from '$lib/shell/facades/settings.facade';
  import { createOnboardingStore } from '$lib/state/onboarding.svelte';
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

  const onboarding = createOnboardingStore();

  const isSaving = $derived(onboarding.state === 'saving');
  const hasError = $derived(onboarding.state === 'error');
  const errorMessage = $derived(onboarding.error);
  let alertPreferences = $state<ConnectedAlertPreferences>(DEFAULT_CONNECTED_ALERT_PREFERENCES);
  let isSavingAlertPreferences = $state(false);

  (async () => {
    alertPreferences = await getAlertPreferences();
  })().catch(() => {});

  function handleUpdateProfile(updates: Partial<UserProfile>) {
    onboarding.updateProfile(updates);
  }

  async function handleComplete() {
    onboarding.save();

    // Unwrap $state proxy to plain object for IndexedDB storage
    const profile = JSON.parse(JSON.stringify(onboarding.profile)) as UserProfile;

    try {
      await saveProfile(profile);
      window.dispatchEvent(new CustomEvent('profile-updated'));
      onboarding.saveSuccess();
      onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
      onboarding.saveError(message);
    }
  }

  function handleRetry() {
    handleComplete();
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
