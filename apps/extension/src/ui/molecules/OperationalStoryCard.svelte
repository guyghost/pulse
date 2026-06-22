<script lang="ts">
  import { Icon, type IconName } from '@pulse/ui';
  import OperationalStatusBadge, {
    type OperationalSeverity,
  } from '../atoms/OperationalStatusBadge.svelte';

  export type OperationalEvidence = {
    label: string;
    value: string | number;
    icon?: IconName;
    severity?: OperationalSeverity;
  };

  const {
    eyebrow,
    title,
    description,
    severity = 'neutral',
    statusLabel = null,
    evidence = [],
    primaryActionLabel = null,
    primaryActionIcon = 'arrow-right',
    secondaryActionLabel = null,
    secondaryActionIcon = 'chevron-right',
    compact = false,
    onPrimaryAction,
    onSecondaryAction,
  }: {
    eyebrow?: string;
    title: string;
    description?: string;
    severity?: OperationalSeverity;
    statusLabel?: string | null;
    evidence?: OperationalEvidence[];
    primaryActionLabel?: string | null;
    primaryActionIcon?: IconName;
    secondaryActionLabel?: string | null;
    secondaryActionIcon?: IconName;
    compact?: boolean;
    onPrimaryAction?: () => void;
    onSecondaryAction?: () => void;
  } = $props();

  const containerClass = $derived(
    severity === 'success'
      ? 'border-accent-green/20 bg-accent-green/6'
      : severity === 'attention'
        ? 'border-status-yellow/30 bg-status-yellow/10'
        : severity === 'incident'
          ? 'border-status-orange/25 bg-status-orange/8'
          : severity === 'critical'
            ? 'border-status-red/30 bg-status-red/10'
            : 'border-border-light bg-surface-white'
  );

  const iconClass = $derived(
    severity === 'success'
      ? 'bg-accent-green/10 text-accent-green'
      : severity === 'attention'
        ? 'bg-status-yellow/15 text-status-orange'
        : severity === 'incident'
          ? 'bg-status-orange/10 text-status-orange'
          : severity === 'critical'
            ? 'bg-status-red/10 text-status-red'
            : 'bg-blueprint-blue/8 text-blueprint-blue'
  );

  function evidenceClass(itemSeverity: OperationalSeverity | undefined): string {
    if (itemSeverity === 'success') {
      return 'text-accent-green';
    }
    if (itemSeverity === 'attention' || itemSeverity === 'incident') {
      return 'text-status-orange';
    }
    if (itemSeverity === 'critical') {
      return 'text-status-red';
    }
    return 'text-text-primary';
  }
</script>

<section
  class="rounded-xl border p-4 transition-colors {containerClass} {compact
    ? 'space-y-3'
    : 'space-y-4'}"
>
  <div class="flex items-start gap-3">
    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg {iconClass}">
      <Icon
        name={severity === 'success'
          ? 'shield-check'
          : severity === 'attention'
            ? 'circle-alert'
            : severity === 'incident' || severity === 'critical'
              ? 'triangle-alert'
              : 'radar'}
        size={16}
      />
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        {#if eyebrow}
          <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
            {eyebrow}
          </p>
        {/if}
        {#if statusLabel}
          <OperationalStatusBadge label={statusLabel} {severity} />
        {/if}
      </div>
      <h3 class="mt-1 text-sm font-semibold leading-5 text-text-primary">{title}</h3>
      {#if description}
        <p class="mt-1 text-xs leading-5 text-text-subtle">{description}</p>
      {/if}
    </div>
  </div>

  {#if evidence.length > 0}
    <div class="grid grid-cols-3 gap-2">
      {#each evidence as item}
        <div class="rounded-lg border border-border-light bg-surface-white/70 px-3 py-2">
          <p class="flex items-center gap-1 text-[9px] uppercase tracking-[0.13em] text-text-muted">
            {#if item.icon}
              <Icon name={item.icon} size={10} />
            {/if}
            {item.label}
          </p>
          <p
            class="mt-1 font-mono text-sm font-semibold tabular-nums {evidenceClass(item.severity)}"
          >
            {item.value}
          </p>
        </div>
      {/each}
    </div>
  {/if}

  {#if primaryActionLabel || secondaryActionLabel}
    <div class="flex flex-wrap gap-2 border-t border-border-light pt-3">
      {#if primaryActionLabel}
        <button
          class="inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blueprint-blue/90"
          onclick={onPrimaryAction}
          type="button"
        >
          <Icon name={primaryActionIcon} size={13} />
          {primaryActionLabel}
        </button>
      {/if}
      {#if secondaryActionLabel}
        <button
          class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray"
          onclick={onSecondaryAction}
          type="button"
        >
          <Icon name={secondaryActionIcon} size={13} />
          {secondaryActionLabel}
        </button>
      {/if}
    </div>
  {/if}
</section>
