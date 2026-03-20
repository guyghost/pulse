<script lang="ts">
  import OnboardingLayout from '../templates/OnboardingLayout.svelte';
  import OnboardingWizard from '../organisms/OnboardingWizard.svelte';
  import type { UserProfile } from '$lib/core/types/profile';
  import { sendMessage } from '$lib/shell/messaging/bridge';
  import { createOnboardingStore } from '$lib/state/onboarding.svelte';

  let { onComplete }: { onComplete?: () => void } = $props();

  const onboarding = createOnboardingStore();

  let isSaving = $derived(onboarding.state === 'saving');
  let hasError = $derived(onboarding.state === 'error');
  let errorMessage = $derived(onboarding.error);

  function handleUpdateProfile(updates: Partial<UserProfile>) {
    onboarding.updateProfile(updates);
  }

  async function handleComplete() {
    onboarding.save();

    const profile = onboarding.profile;

    try {
      await sendMessage({
        type: 'SAVE_PROFILE',
        payload: profile as UserProfile,
      });
      onboarding.saveSuccess();
      onComplete?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
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
    onUpdateProfile={handleUpdateProfile}
    onRetry={handleRetry}
    {isSaving}
    {hasError}
    errorMessage={errorMessage}
  />
{/snippet}

<OnboardingLayout content={wizardContent} />
