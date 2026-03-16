<script lang="ts">
  import OnboardingLayout from '../templates/OnboardingLayout.svelte';
  import OnboardingWizard from '../organisms/OnboardingWizard.svelte';
  import type { UserProfile } from '$lib/core/types/profile';
  import { sendMessage } from '$lib/shell/messaging/bridge';

  let { onComplete }: { onComplete?: () => void } = $props();

  let profile: Partial<UserProfile> = {
    location: '',
    remote: 'any',
    seniority: 'confirmed',
    stack: [],
  };

  function handleUpdateProfile(updates: Partial<UserProfile>) {
    profile = { ...profile, ...updates };
  }

  async function handleComplete() {
    try {
      await sendMessage({ type: 'SAVE_PROFILE', payload: profile as UserProfile });
    } catch {
      // Outside extension context
    }
    onComplete?.();
  }
</script>

<OnboardingLayout content={wizardContent}>
  {#snippet wizardContent()}
    <OnboardingWizard
      onComplete={handleComplete}
      onUpdateProfile={handleUpdateProfile}
    />
  {/snippet}
</OnboardingLayout>
