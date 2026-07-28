<script lang="ts">
  /**
   * Onboarding shell — machine-driven.
   *
   * Owns all I/O: it subscribes to the pure flow machine, consumes the emitted
   * {@link OnboardingFlowEffect} descriptors (PERSIST_PROFILE, START_SCAN) and
   * reports results back via events. The model decides every transition; this
   * page only executes effects and maps UI intent to events.
   *
   * "The LLM produces signals; the model decides." Here the model also produces
   * the effect signals; the shell is the sole executor.
   */
  import { onDestroy } from 'svelte';
  import OnboardingLayout from '../templates/OnboardingLayout.svelte';
  import OnboardingFlow from '../organisms/OnboardingFlow.svelte';
  import type {
    OnboardingFlowEvent,
    OnboardingFlowEffect,
  } from '../../models/onboarding-flow.machine';
  import { createOnboardingFlowController } from '../../models/onboarding-flow.machine';
  import { getProfile, saveProfile } from '$lib/shell/facades/settings.facade';
  import {
    saveAlertPreferences,
    getAlertPreferences,
  } from '$lib/shell/facades/alert-preferences.facade';
  import {
    DEFAULT_CONNECTED_ALERT_PREFERENCES,
    type ConnectedAlertPreferences,
  } from '$lib/core/types/alert-preferences';
  import { createFeedStore } from '$lib/state/feed.svelte';
  import { createFeedController } from '$lib/shell/facades/feed-controller.svelte';
  import { getConnectorsMeta } from '$lib/shell/connectors/meta';

  const { onComplete }: { onComplete?: () => void } = $props();

  // Inputs (injected, non-deterministic values live in the shell).
  const attemptId = `onb_${crypto.randomUUID()}`;
  const sources = getConnectorsMeta().map(({ id, name }) => ({ id, name }));

  const controller = createOnboardingFlowController({ attemptId, sources });
  let snapshot = $state(controller.getSnapshot());

  let alertPreferences: ConnectedAlertPreferences = DEFAULT_CONNECTED_ALERT_PREFERENCES;
  void (async () => {
    try {
      alertPreferences = await getAlertPreferences();
    } catch {
      // best-effort rehydration; defaults remain.
    }
  })();

  // Best-effort: re-hydrate an existing profile so the wizard pre-fills.
  void (async () => {
    try {
      const existing = await getProfile();
      if (existing) {
        controller.send({
          type: 'UPDATE_PROFILE',
          partial: {
            firstName: existing.firstName,
            jobTitle: existing.jobTitle,
            location: existing.location,
            remote: existing.remote,
            keywords: existing.keywords,
            tjmMin: existing.tjmMin,
            tjmMax: existing.tjmMax,
          },
        });
      }
    } catch {
      // ignore — blank wizard is fine.
    }
  })();

  // Scan runs through the same service-worker path as the feed. Results persist
  // to IndexedDB; FeedPage hydrates them on mount after onboarding completes.
  const feedStore = createFeedStore();
  const feedController = createFeedController(feedStore);

  const unsubscribe = controller.subscribe((next) => {
    snapshot = next;
  });
  controller.start();
  onDestroy(unsubscribe);
  onDestroy(() => controller.stop());
  onDestroy(() => feedController.dispose());

  // ── Effect executor ──────────────────────────────────────────────────────
  // Fires once per emitted effect (ref-equality guard prevents re-runs).
  let lastHandled: OnboardingFlowEffect | null = null;
  let completed = false;

  $effect(() => {
    const effect = snapshot.pendingEffect;
    if (!effect || effect === lastHandled) {
      return;
    }
    lastHandled = effect;
    void runEffect(effect);
  });

  async function runEffect(effect: OnboardingFlowEffect): Promise<void> {
    if (effect.kind === 'PERSIST_PROFILE') {
      try {
        await saveProfile(effect.profile);
        if (effect.notifyEnabled) {
          try {
            alertPreferences = await saveAlertPreferences(alertPreferences);
          } catch {
            // Alert save failure is non-fatal: profile persisted, still scan.
          }
        }
        controller.send({ type: 'PERSISTED' });
      } catch (err) {
        controller.send({
          type: 'PERSIST_FAILED',
          message: err instanceof Error ? err.message : 'Impossible de sauvegarder le profil',
        });
      }
      return;
    }
    // START_SCAN
    try {
      await feedController.startScan();
      controller.send({ type: 'SCAN_DONE' });
    } catch (err) {
      controller.send({
        type: 'SCAN_FAILED',
        message: err instanceof Error ? err.message : 'Le scan a échoué',
      });
    }
  }

  // ── Terminal → onComplete ────────────────────────────────────────────────
  $effect(() => {
    if (snapshot.terminal && !completed) {
      completed = true;
      onComplete?.();
    }
  });

  function handleEvent(event: OnboardingFlowEvent) {
    controller.send(event);
  }
</script>

{#snippet wizardContent()}
  <OnboardingFlow {snapshot} {sources} onEvent={handleEvent} />
{/snippet}

<OnboardingLayout content={wizardContent} />
