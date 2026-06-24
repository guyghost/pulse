<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { Mission } from '$lib/core/types/mission';
  import type { ConnectedAlertPreferences } from '$lib/core/types/alert-preferences';
  import type { AlertHistoryEntry } from '$lib/core/types/alert-history';
  import { summarizeSmartNotificationPreview } from '$lib/core/scoring/smart-notification';
  import OperationalStatusBadge from '../atoms/OperationalStatusBadge.svelte';

  const {
    preferences,
    availableStacks = [],
    previewMissions = [],
    seenMissionIds = [],
    history = [],
    isSaving = false,
    onSave,
  }: {
    preferences: ConnectedAlertPreferences;
    availableStacks?: string[];
    previewMissions?: Mission[];
    seenMissionIds?: string[];
    history?: AlertHistoryEntry[];
    isSaving?: boolean;
    onSave?: (preferences: ConnectedAlertPreferences) => void;
  } = $props();

  let enabled = $state(false);
  let scoreThreshold = $state(70);
  let minDailyRate = $state(0);
  let maxResults = $state(5);
  let requiredStacks = $state<string[]>([]);
  let mutedUntil = $state<string | null>(null);
  let stackInput = $state('');
  let lastRevision = $state(-1);

  $effect(() => {
    if (preferences.revision === lastRevision) {
      return;
    }

    enabled = preferences.enabled;
    scoreThreshold = preferences.scoreThreshold;
    minDailyRate = preferences.minDailyRate;
    maxResults = preferences.maxResults;
    requiredStacks = [...preferences.requiredStacks];
    mutedUntil = preferences.mutedUntil;
    lastRevision = preferences.revision;
  });

  const muteDateFormatter = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const muteUntilTime = $derived(mutedUntil ? Date.parse(mutedUntil) : Number.NaN);
  const isMuteActive = $derived(Number.isFinite(muteUntilTime) && muteUntilTime > Date.now());
  const alertSummary = $derived(
    !enabled
      ? 'Désactivée'
      : isMuteActive
        ? 'En pause'
        : `${scoreThreshold}+${minDailyRate > 0 ? ` · ${minDailyRate}€/j min` : ''}`
  );

  const suggestedStacks = $derived(
    availableStacks.filter(
      (stack) => !requiredStacks.some((selected) => selected.toLowerCase() === stack.toLowerCase())
    )
  );

  const alertPreview = $derived.by(() =>
    summarizeSmartNotificationPreview(previewMissions, seenMissionIds, {
      scoreThreshold,
      requiredStacks,
      minTJM: minDailyRate,
      maxResults,
    })
  );

  const alertPreviewText = $derived.by(() => {
    if (!enabled) {
      return 'Aucune notification ne partira tant que l’alerte reste désactivée.';
    }

    if (isMuteActive) {
      return `Aucune notification ne partira avant ${formatMuteUntil(mutedUntil)}. Les critères restent prêts pour la reprise.`;
    }

    if (alertPreview.totalMissions === 0) {
      return 'Aucun scan local disponible pour estimer le volume. Lancez un scan pour calibrer cette alerte.';
    }

    if (alertPreview.notifyCount === 0) {
      return 'Avec vos données actuelles, aucune mission non vue ne franchirait ces critères.';
    }

    const missionLabel = `${alertPreview.notifyCount} mission${alertPreview.notifyCount > 1 ? 's' : ''}`;
    const limitLabel =
      alertPreview.limitedCount > 0
        ? ` ${alertPreview.limitedCount} autre${alertPreview.limitedCount > 1 ? 's' : ''} resterait${alertPreview.limitedCount > 1 ? 'ent' : ''} hors notification à cause de la limite.`
        : '';

    return `Avec vos données actuelles, cette alerte notifierait ${missionLabel}.${limitLabel}`;
  });

  const alertPreviewSeenText = $derived.by(() => {
    const missionLabel = `${alertPreview.seenCount} mission${alertPreview.seenCount > 1 ? 's' : ''}`;
    const seenLabel = `déjà vue${alertPreview.seenCount > 1 ? 's' : ''}`;
    const excludedLabel = `exclue${alertPreview.seenCount > 1 ? 's' : ''}`;

    return `${missionLabel} ${seenLabel} ${excludedLabel} du volume.`;
  });

  const recentAlertHistory = $derived(history.slice(0, 3));
  const alertHistorySummary = $derived(
    history.length > 0
      ? `${history.length} déclenchement${history.length > 1 ? 's' : ''}`
      : 'Aucun historique'
  );

  const alertHistoryDateFormatter = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  function formatMuteUntil(value: string | null): string {
    if (!value) {
      return 'la reprise';
    }

    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      return 'la reprise';
    }

    return muteDateFormatter.format(new Date(timestamp));
  }

  function pauseAlerts(hours: number): void {
    mutedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  function resumeAlerts(): void {
    mutedUntil = null;
  }

  function formatAlertHistoryTime(triggeredAt: number): string {
    if (!Number.isFinite(triggeredAt) || triggeredAt <= 0) {
      return 'Date inconnue';
    }

    return alertHistoryDateFormatter.format(new Date(triggeredAt));
  }

  function formatAlertHistoryCriteria(entry: AlertHistoryEntry): string {
    const criteria = [`Score ${entry.scoreThreshold}+`];

    if (entry.minDailyRate > 0) {
      criteria.push(`${entry.minDailyRate}€/j min`);
    }

    if (entry.requiredStacks.length > 0) {
      criteria.push(entry.requiredStacks.join(', '));
    }

    return criteria.join(' · ');
  }

  function formatAlertHistoryTitles(entry: AlertHistoryEntry): string {
    if (entry.missionTitles.length === 0) {
      return `${entry.missionCount} mission${entry.missionCount > 1 ? 's' : ''}`;
    }

    const visibleTitles = entry.missionTitles.slice(0, 2).join(', ');
    const remainingCount = Math.max(0, entry.missionCount - entry.missionTitles.slice(0, 2).length);
    const suffix = remainingCount > 0 ? ` +${remainingCount}` : '';

    return `${visibleTitles}${suffix}`;
  }

  function addStack(value = stackInput): void {
    const clean = value.trim();
    if (!clean) {
      return;
    }
    const exists = requiredStacks.some((stack) => stack.toLowerCase() === clean.toLowerCase());
    if (exists) {
      stackInput = '';
      return;
    }
    requiredStacks = [...requiredStacks, clean].slice(0, 12);
    stackInput = '';
  }

  function removeStack(value: string): void {
    requiredStacks = requiredStacks.filter((stack) => stack !== value);
  }

  function save(): void {
    onSave?.({
      enabled,
      scoreThreshold,
      minDailyRate,
      requiredStacks,
      maxResults,
      mutedUntil: isMuteActive ? mutedUntil : null,
      revision: preferences.revision,
      updatedAt: preferences.updatedAt,
    });
  }
</script>

<section class="section-card rounded-xl p-5">
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0">
      <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
        Alerte prioritaire
      </p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Définir ce qui mérite une action</h3>
      <p class="mt-1 text-xs leading-5 text-text-subtle">
        Pulse remonte les missions qui franchissent ce seuil avant le reste du feed.
      </p>
    </div>
    <OperationalStatusBadge label={alertSummary} severity={enabled ? 'attention' : 'neutral'} />
  </div>

  <div class="mt-4 grid gap-3">
    <label
      class="flex items-center justify-between gap-3 rounded-lg border border-border-light bg-page-canvas px-3 py-2.5"
    >
      <span>
        <span class="block text-xs font-medium text-text-primary">Activer les alertes</span>
        <span class="mt-0.5 block text-[11px] text-text-subtle">
          Les missions qualifiées apparaissent comme action prioritaire.
        </span>
      </span>
      <input type="checkbox" bind:checked={enabled} class="h-4 w-4 accent-blueprint-blue" />
    </label>

    <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-medium text-text-primary">Pause temporaire</p>
          <p class="mt-0.5 text-[11px] leading-5 text-text-subtle">
            Suspendre les notifications sans perdre les critères de l’alerte.
          </p>
        </div>
        <OperationalStatusBadge
          label={isMuteActive ? 'Pause active' : 'Active'}
          severity={isMuteActive ? 'attention' : 'success'}
        />
      </div>
      {#if isMuteActive}
        <p class="mt-2 rounded-md bg-surface-white px-2 py-1.5 text-[11px] text-text-subtle">
          Reprise automatique le {formatMuteUntil(mutedUntil)}.
        </p>
      {/if}
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-surface-white px-2.5 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-subtle-gray"
          onclick={() => pauseAlerts(1)}
        >
          <Icon name="clock" size={12} />
          1h
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-surface-white px-2.5 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-subtle-gray"
          onclick={() => pauseAlerts(24)}
        >
          <Icon name="clock" size={12} />
          24h
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-surface-white px-2.5 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-subtle-gray disabled:opacity-45"
          onclick={resumeAlerts}
          disabled={!isMuteActive}
        >
          <Icon name="play" size={12} />
          Reprendre
        </button>
      </div>
    </div>

    <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-3">
      <div class="flex items-center justify-between gap-3">
        <label for="alert-score" class="text-xs font-medium text-text-primary">Score minimum</label>
        <span class="font-mono text-sm font-semibold tabular-nums text-text-primary">
          {scoreThreshold}+
        </span>
      </div>
      <input
        id="alert-score"
        type="range"
        min="40"
        max="95"
        step="5"
        bind:value={scoreThreshold}
        class="mt-3 w-full"
      />
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
        <span class="block text-[10px] uppercase tracking-[0.13em] text-text-muted">TJM min</span>
        <input
          type="number"
          min="0"
          max="5000"
          bind:value={minDailyRate}
          class="mt-1 w-full bg-transparent font-mono text-sm font-semibold text-text-primary outline-none"
        />
      </label>
      <label class="rounded-lg border border-border-light bg-page-canvas px-3 py-2.5">
        <span class="block text-[10px] uppercase tracking-[0.13em] text-text-muted">
          Max résultats
        </span>
        <input
          type="number"
          min="1"
          max="20"
          bind:value={maxResults}
          class="mt-1 w-full bg-transparent font-mono text-sm font-semibold text-text-primary outline-none"
        />
      </label>
    </div>

    <div class="rounded-lg border border-border-light bg-page-canvas px-3 py-3">
      <label for="alert-stack" class="text-xs font-medium text-text-primary">Stacks requises</label>
      <div class="mt-2 flex gap-2">
        <input
          id="alert-stack"
          type="text"
          bind:value={stackInput}
          placeholder="ex: React"
          class="min-w-0 flex-1 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs text-text-primary outline-none focus:border-blueprint-blue/30"
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addStack();
            }
          }}
        />
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-primary transition-colors hover:bg-subtle-gray"
          onclick={() => addStack()}
          aria-label="Ajouter une stack à l'alerte"
        >
          <Icon name="plus" size={13} />
        </button>
      </div>

      {#if suggestedStacks.length > 0}
        <div class="mt-2 flex flex-wrap gap-1.5">
          {#each suggestedStacks.slice(0, 4) as stack}
            <button
              type="button"
              class="rounded-md bg-surface-white px-2 py-1 text-[10px] text-text-subtle transition-colors hover:text-text-primary"
              onclick={() => addStack(stack)}
            >
              {stack}
            </button>
          {/each}
        </div>
      {/if}

      {#if requiredStacks.length > 0}
        <div class="mt-3 flex flex-wrap gap-1.5">
          {#each requiredStacks as stack}
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-md bg-blueprint-blue/8 px-2 py-1 text-[10px] font-medium text-blueprint-blue"
              onclick={() => removeStack(stack)}
            >
              {stack}
              <Icon name="x" size={10} />
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div
    class="mt-4 rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/5 px-3 py-3"
    aria-live="polite"
  >
    <div class="flex items-start gap-2">
      <Icon name="activity" size={14} class="mt-0.5 shrink-0 text-blueprint-blue" />
      <div class="min-w-0">
        <p class="text-xs font-medium text-text-primary">Aperçu avec vos données actuelles</p>
        <p class="mt-1 text-[11px] leading-5 text-text-subtle">{alertPreviewText}</p>
      </div>
    </div>
    <div class="mt-3 grid grid-cols-3 gap-2 text-center">
      <div class="rounded-md bg-surface-white px-2 py-2">
        <p class="font-mono text-sm font-semibold tabular-nums text-text-primary">
          {alertPreview.totalMissions}
        </p>
        <p class="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-text-muted">Locales</p>
      </div>
      <div class="rounded-md bg-surface-white px-2 py-2">
        <p class="font-mono text-sm font-semibold tabular-nums text-text-primary">
          {alertPreview.matchingCount}
        </p>
        <p class="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-text-muted">Éligibles</p>
      </div>
      <div class="rounded-md bg-surface-white px-2 py-2">
        <p class="font-mono text-sm font-semibold tabular-nums text-text-primary">
          {alertPreview.notifyCount}
        </p>
        <p class="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-text-muted">Notifiées</p>
      </div>
    </div>
    {#if alertPreview.seenCount > 0}
      <p class="mt-2 text-[10px] leading-4 text-text-muted">{alertPreviewSeenText}</p>
    {/if}
  </div>

  <div class="mt-3 rounded-lg border border-border-light bg-page-canvas px-3 py-3">
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-start gap-2">
        <Icon name="clock" size={14} class="mt-0.5 shrink-0 text-text-subtle" />
        <div class="min-w-0">
          <p class="text-xs font-medium text-text-primary">Historique récent</p>
          <p class="mt-1 text-[11px] leading-5 text-text-subtle">
            Derniers lots réellement envoyés par Chrome.
          </p>
        </div>
      </div>
      <OperationalStatusBadge
        label={alertHistorySummary}
        severity={history.length > 0 ? 'success' : 'neutral'}
      />
    </div>

    {#if recentAlertHistory.length > 0}
      <div class="mt-3 space-y-2">
        {#each recentAlertHistory as entry}
          <div class="rounded-lg border border-border-light bg-surface-white px-3 py-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10px] font-medium text-text-subtle">
                {formatAlertHistoryTime(entry.triggeredAt)}
              </span>
              <span class="font-mono text-[10px] font-semibold text-text-primary">
                {entry.missionCount} mission{entry.missionCount > 1 ? 's' : ''}
              </span>
            </div>
            <p class="mt-1 truncate text-xs font-medium text-text-primary">
              {formatAlertHistoryTitles(entry)}
            </p>
            <p class="mt-1 truncate text-[10px] text-text-muted">
              {formatAlertHistoryCriteria(entry)}
            </p>
          </div>
        {/each}
      </div>
    {:else}
      <p class="mt-3 rounded-lg bg-surface-white px-3 py-2 text-[11px] leading-5 text-text-subtle">
        Les déclenchements apparaîtront ici après un scan qui franchit vos critères.
      </p>
    {/if}
  </div>

  <button
    type="button"
    class="mt-4 inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blueprint-blue/90 disabled:opacity-50"
    disabled={isSaving}
    onclick={save}
  >
    <Icon name={isSaving ? 'loader' : 'save'} size={13} class={isSaving ? 'animate-spin' : ''} />
    {isSaving ? 'Sauvegarde...' : "Enregistrer l'alerte"}
  </button>
</section>
