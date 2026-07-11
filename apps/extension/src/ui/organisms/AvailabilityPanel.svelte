<script lang="ts">
  import { untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import { Button, Icon, type IconName } from '@pulse/ui';
  import {
    AVAILABILITY_NOTE_MAX_LENGTH,
    AVAILABILITY_STATUS_LABELS,
    AVAILABILITY_STATUS_ORDER,
    type AvailabilityStatus,
  } from '$lib/core/types/availability';
  import { formatAvailabilityDate } from '$lib/core/availability/availability-helpers';
  import type { AvailabilityStore, PlatformPushStatus } from '$lib/state/availability.svelte';
  import type { PlatformSyncTarget } from '$lib/core/cv/experience-helpers';

  const {
    store,
    platforms,
  }: {
    store: AvailabilityStore;
    platforms: PlatformSyncTarget[];
  } = $props();

  const isEditing = $derived(store.editStatus === 'editing' || store.editStatus === 'saving');
  const isPushing = $derived(store.pushStatus === 'preparing' || store.pushStatus === 'pushing');
  const doneCount = $derived(countByStatus(store.platformStatuses, 'done'));

  function countByStatus(map: Map<string, PlatformPushStatus>, status: PlatformPushStatus): number {
    let n = 0;
    for (const v of map.values()) {
      if (v === status) {
        n += 1;
      }
    }
    return n;
  }

  function statusMeta(status: PlatformPushStatus | undefined): {
    icon: IconName | null;
    label: string;
    class: string;
    spin?: boolean;
  } {
    switch (status) {
      case 'done':
        return { icon: 'check-circle', label: 'Diffusée', class: 'text-accent-green' };
      case 'copying':
        return { icon: 'loader-2', label: 'Ouverture…', class: 'text-blueprint-blue', spin: true };
      case 'error':
        return { icon: 'x-circle', label: 'Échec', class: 'text-status-red' };
      case 'skipped':
        return { icon: 'circle-alert', label: 'Ignorée', class: 'text-text-muted' };
      default:
        return { icon: null, label: 'En attente', class: 'text-text-muted' };
    }
  }

  const pushHeadline = $derived.by(() => {
    switch (store.pushStatus) {
      case 'pushed':
        return 'Disponibilité diffusée sur toutes les plateformes.';
      case 'partial':
        return `Diffusée sur ${doneCount}/${platforms.length} plateformes.`;
      case 'error':
        return store.pushError ?? 'La diffusion a échoué.';
      case 'cancelled':
        return 'Diffusion annulée.';
      default:
        return null;
    }
  });

  // ── Edit form state ────────────────────────────────────────────────────
  // The parent keeps `draft` stable for the duration of an edit session, so
  // we snapshot it once via untrack (silences state_referenced_locally).
  let statusDraft = $state<AvailabilityStatus>(untrack(() => store.draft?.status ?? 'immediate'));
  let dateDraft = $state<string>(untrack(() => store.draft?.date ?? ''));
  let noteDraft = $state<string>(untrack(() => store.draft?.note ?? ''));

  const needsDate = $derived(statusDraft === 'from-date' || statusDraft === 'in-mission-until');
  const noteLen = $derived(noteDraft.length);

  function handleSave() {
    store.saveDraft(statusDraft, needsDate ? dateDraft || null : null, noteDraft);
  }

  function handleStartEdit() {
    store.startEdit();
    // Resync local form fields from the freshly-created draft.
    statusDraft = store.draft?.status ?? 'immediate';
    dateDraft = store.draft?.date ?? '';
    noteDraft = store.draft?.note ?? '';
  }
</script>

<div class="section-card-strong rounded-xl p-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="min-w-0">
      <h2 class="text-sm font-semibold text-text-primary">Disponibilité</h2>
      <p class="mt-0.5 text-[11px] leading-relaxed text-text-secondary">
        Indiquez votre statut, puis diffusez-le sur vos plateformes de missions.
      </p>
    </div>
    {#if !isEditing}
      <Button
        variant="secondary"
        size="sm"
        onclick={handleStartEdit}
        disabled={store.loadStatus === 'loading'}
      >
        <Icon name="pencil" size={14} />
        {store.availability ? 'Modifier' : 'Renseigner'}
      </Button>
    {/if}
  </div>

  {#if store.loadStatus === 'loading'}
    <div class="mt-3 flex items-center gap-2 text-[11px] text-text-muted">
      <Icon name="loader-2" size={13} class="animate-spin" />
      Chargement…
    </div>
  {:else if store.loadError}
    <div
      class="mt-3 rounded-lg bg-status-red/10 px-3 py-2 text-[11px] leading-relaxed text-text-primary"
    >
      <Icon name="triangle-alert" size={13} />
      {store.loadError}
    </div>
  {/if}

  {#if !isEditing && store.availability}
    <div
      class="mt-3 rounded-lg bg-subtle-gray px-3 py-2 text-[11px] leading-relaxed text-text-primary"
    >
      <span class="font-medium">{AVAILABILITY_STATUS_LABELS[store.availability.status]}</span>
      {#if store.availability.date}
        <span class="text-text-secondary">
          — {formatAvailabilityDate(store.availability.date)}</span
        >
      {/if}
      {#if store.availability.note}
        <span class="block mt-1 text-text-secondary">{store.availability.note}</span>
      {/if}
    </div>
  {:else if !isEditing && !store.availability && store.loadStatus === 'idle'}
    <div
      class="mt-3 rounded-lg bg-subtle-gray px-3 py-2 text-[11px] leading-relaxed text-text-secondary"
    >
      Aucune disponibilité renseignée. Cliquez sur « Renseigner » pour la définir.
    </div>
  {/if}

  {#if isEditing}
    <form
      class="mt-3 space-y-3"
      onsubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
    >
      <label class="flex flex-col gap-1">
        <span class="text-[11px] font-medium text-text-secondary">Statut</span>
        <select
          bind:value={statusDraft}
          class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
        >
          {#each AVAILABILITY_STATUS_ORDER as opt (opt)}
            <option value={opt}>{AVAILABILITY_STATUS_LABELS[opt]}</option>
          {/each}
        </select>
      </label>

      {#if needsDate}
        <label class="flex flex-col gap-1">
          <span class="text-[11px] font-medium text-text-secondary">
            {statusDraft === 'from-date' ? 'Disponible à partir du' : 'En mission jusqu’au'}
          </span>
          <input
            bind:value={dateDraft}
            type="date"
            class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm text-text-primary focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
          />
        </label>
      {/if}

      <label class="flex flex-col gap-1">
        <span class="text-[11px] font-medium text-text-secondary">Note (optionnel)</span>
        <textarea
          bind:value={noteDraft}
          rows="2"
          maxlength={AVAILABILITY_NOTE_MAX_LENGTH}
          placeholder="Précisions : rythme, remote, foursquare…"
          class="resize-y rounded-lg border border-border-light bg-surface-white px-3 py-2 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-blueprint-blue focus:outline-none focus:ring-2 focus:ring-blueprint-blue/20"
        ></textarea>
        <span class="text-right text-[10px] text-text-muted"
          >{noteLen}/{AVAILABILITY_NOTE_MAX_LENGTH}</span
        >
      </label>

      {#if store.editError}
        <div
          class="rounded-lg bg-status-red/10 px-3 py-2 text-[11px] leading-relaxed text-text-primary"
        >
          <Icon name="triangle-alert" size={13} />
          {store.editError}
        </div>
      {/if}

      <div class="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" type="button" onclick={() => store.cancelEdit()}>
          Annuler
        </Button>
        <Button variant="primary" size="sm" type="submit" loading={store.editStatus === 'saving'}>
          <Icon name="check-circle" size={14} />
          Enregistrer
        </Button>
      </div>
    </form>
  {/if}

  {#if !isEditing}
    <div class="mt-3 border-t border-border-light pt-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-[11px] leading-relaxed text-text-secondary">
          Copie le statut dans le presse-papiers puis ouvre chaque plateforme pour collage manuel.
        </p>
        {#if isPushing}
          <Button variant="secondary" size="sm" onclick={() => store.cancelPush()}>
            <Icon name="x-circle" size={14} />
            Annuler
          </Button>
        {:else}
          <Button
            variant="primary"
            size="sm"
            onclick={() => store.startPush()}
            disabled={!store.canPush}
            loading={store.pushStatus === 'preparing'}
          >
            <Icon name="send" size={14} />
            Diffuser
          </Button>
        {/if}
      </div>

      {#if pushHeadline}
        <div
          class="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed
            {store.pushStatus === 'pushed'
            ? 'bg-accent-green/10 text-text-primary'
            : store.pushStatus === 'partial'
              ? 'bg-status-yellow/12 text-text-primary'
              : store.pushStatus === 'error'
                ? 'bg-status-red/10 text-text-primary'
                : 'bg-subtle-gray text-text-secondary'}"
        >
          <Icon
            name={store.pushStatus === 'pushed'
              ? 'check-circle'
              : store.pushStatus === 'error'
                ? 'triangle-alert'
                : 'circle-alert'}
            size={13}
          />
          <span>{pushHeadline}</span>
        </div>
      {/if}

      {#if isPushing || (store.platformStatuses.size > 0 && store.pushStatus !== 'idle')}
        <ul transition:slide={{ duration: 180 }} class="mt-2 space-y-1.5">
          {#each platforms as platform (platform.id)}
            {@const meta = statusMeta(store.platformStatuses.get(platform.id))}
            <li class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
              <span class="truncate text-xs text-text-secondary">{platform.name}</span>
              <span class="inline-flex shrink-0 items-center gap-1 text-[11px] {meta.class}">
                {#if meta.icon}
                  <Icon name={meta.icon} size={12} class={meta.spin ? 'animate-spin' : ''} />
                {:else}
                  <span class="h-1.5 w-1.5 rounded-full bg-text-muted/60"></span>
                {/if}
                {meta.label}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
