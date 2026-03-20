<script lang="ts">
  import OnboardingLayout from '../templates/OnboardingLayout.svelte';
  import OnboardingWizard from '../organisms/OnboardingWizard.svelte';
  import type { UserProfile } from '$lib/core/types/profile';
  import { sendMessage } from '$lib/shell/messaging/bridge';
  import { createActor } from 'xstate';
  import {
    onboardingMachine,
    onboardingEvents,
  } from '$lib/../machines/onboarding.machine';

  let { onComplete }: { onComplete?: () => void } = $props();

  const actor = createActor(onboardingMachine);
  actor.start();

  let snapshot = $state(actor.getSnapshot());

  actor.subscribe((s) => {
    snapshot = s;
  });

  let isSaving = $derived(snapshot.matches('saving'));
  let hasError = $derived(snapshot.matches('error'));
  let errorMessage = $derived(snapshot.context.error);

  function handleUpdateProfile(updates: Partial<UserProfile>) {
    actor.send(onboardingEvents.updateProfile(updates));
  }

  async function handleComplete() {
    actor.send(onboardingEvents.save());

    const profile = actor.getSnapshot().context.profile;

    try {
      await sendMessage({
        type: 'SAVE_PROFILE',
        payload: profile as UserProfile,
      });
      actor.send(onboardingEvents.saveSuccess());
      onComplete?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
      actor.send(onboardingEvents.saveError(message));
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
