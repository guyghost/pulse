<script lang="ts">
  import { createActor } from 'xstate';
  import { onboardingMachine } from '../../machines/onboarding.machine';
  import OnboardingLayout from '../templates/OnboardingLayout.svelte';
  import OnboardingWizard from '../organisms/OnboardingWizard.svelte';
  import type { UserProfile } from '$lib/core/types/profile';
  import { sendMessage } from '$lib/shell/messaging/bridge';

  let { onComplete }: { onComplete?: () => void } = $props();

  const actor = createActor(onboardingMachine);
  actor.start();

  let snapshot = $state(actor.getSnapshot());

  $effect(() => {
    const sub = actor.subscribe((s) => { snapshot = s; });
    return () => sub.unsubscribe();
  });

  let stepMap: Record<string, number> = {
    welcome: 0,
    profile: 0,
    connectors: 1,
    firstScan: 2,
    done: 2,
  };

  let currentStep = $derived(stepMap[String(snapshot.value)] ?? 0);

  function handleNext() {
    actor.send({ type: 'NEXT' });
  }

  function handleBack() {
    actor.send({ type: 'BACK' });
  }

  function handleUpdateProfile(profile: Partial<UserProfile>) {
    actor.send({ type: 'SET_PROFILE', profile });
  }

  async function handleComplete() {
    // Save profile via messaging bridge
    const profile = snapshot.context.profile as UserProfile;
    try {
      await sendMessage({ type: 'SAVE_PROFILE', payload: profile });
    } catch {
      // Outside extension context — profile will be saved when extension is loaded
    }
    onComplete?.();
  }

  // Auto-complete when machine reaches 'done'
  $effect(() => {
    if (snapshot.matches('done')) {
      handleComplete();
    }
  });
</script>

<OnboardingLayout content={wizardContent}>
  {#snippet wizardContent()}
    <OnboardingWizard
      step={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onComplete={handleComplete}
      onUpdateProfile={handleUpdateProfile}
    />
  {/snippet}
</OnboardingLayout>
