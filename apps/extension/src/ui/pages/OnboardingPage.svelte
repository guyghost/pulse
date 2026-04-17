<script lang="ts">
  import OnboardingLayout from '../templates/OnboardingLayout.svelte';
  import OnboardingWizard from '../organisms/OnboardingWizard.svelte';
  import type { UserProfile } from '$lib/core/types/profile';
  import { saveProfile } from '$lib/shell/facades/settings.facade';
  import { rescoreStoredMissions } from '$lib/shell/scan/rescore';
  import { createOnboardingStore } from '$lib/state/onboarding.svelte';

  const { onComplete, onSkip }: { onComplete?: () => void; onSkip?: () => void } = $props();

  const onboarding = createOnboardingStore();

  const isSaving = $derived(onboarding.state === 'saving');
  const hasError = $derived(onboarding.state === 'error');
  const errorMessage = $derived(onboarding.error);

  function handleUpdateProfile(updates: Partial<UserProfile>) {
    onboarding.updateProfile(updates);
  }

  async function handleComplete() {
    onboarding.save();

    // Unwrap $state proxy to plain object for IndexedDB storage
    const profile = JSON.parse(JSON.stringify(onboarding.profile)) as UserProfile;

    try {
      await saveProfile(profile);
      const rescored = await rescoreStoredMissions(profile);
      window.dispatchEvent(new CustomEvent('missions-rescored', { detail: rescored }));
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
  />
{/snippet}

<OnboardingLayout content={wizardContent} />
