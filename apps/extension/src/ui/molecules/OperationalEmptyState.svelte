<script lang="ts">
  import { Icon, type IconName } from '@pulse/ui';
  import OperationalStatusBadge, {
    type OperationalSeverity,
  } from '../atoms/OperationalStatusBadge.svelte';

  const {
    title,
    description,
    severity = 'neutral',
    statusLabel = null,
    icon = 'radar',
    proofLabel = null,
    proofValue = null,
    primaryActionLabel = null,
    primaryActionIcon = 'arrow-right',
    secondaryActionLabel = null,
    secondaryActionIcon = 'chevron-right',
    onPrimaryAction,
    onSecondaryAction,
  }: {
    title: string;
    description: string;
    severity?: OperationalSeverity;
    statusLabel?: string | null;
    icon?: IconName;
    proofLabel?: string | null;
    proofValue?: string | number | null;
    primaryActionLabel?: string | null;
    primaryActionIcon?: IconName;
    secondaryActionLabel?: string | null;
    secondaryActionIcon?: IconName;
    onPrimaryAction?: () => void;
    onSecondaryAction?: () => void;
  } = $props();

  const toneClass = $derived(
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
            : 'bg-blueprint-blue/8 text-blueprint-blue-on-tint'
  );
</script>

<section class="rounded-2xl border px-4 py-5 {toneClass}">
  <div class="flex items-start gap-3">
    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl {iconClass}">
      <Icon name={icon} size={18} />
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <p class="eyebrow eyebrow--caption eyebrow--strong eyebrow--subtle">Décision</p>
        {#if statusLabel}
          <OperationalStatusBadge label={statusLabel} {severity} />
        {/if}
      </div>
      <h3 class="mt-1 text-body-lg font-semibold leading-5 text-text-primary">{title}</h3>
      <p class="mt-1 text-meta leading-5 text-text-subtle">{description}</p>
    </div>
  </div>

  {#if proofLabel && proofValue !== null}
    <div class="mt-4 rounded-lg border border-border-light bg-surface-white/70 px-3 py-2">
      <p class="eyebrow eyebrow--caption eyebrow--strong eyebrow--subtle">
        {proofLabel}
      </p>
      <p class="mt-1 font-mono text-body-lg font-semibold tabular-nums text-text-primary">
        {proofValue}
      </p>
    </div>
  {/if}

  {#if primaryActionLabel || secondaryActionLabel}
    <div class="mt-4 flex flex-wrap gap-2 border-t border-border-light pt-3">
      {#if primaryActionLabel}
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg bg-blueprint-blue-strong px-3 py-2 text-meta font-medium text-white transition-colors hover:bg-blueprint-blue-strong/90"
          onclick={onPrimaryAction}
        >
          <Icon name={primaryActionIcon} size={13} />
          {primaryActionLabel}
        </button>
      {/if}
      {#if secondaryActionLabel}
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-meta font-medium text-text-primary transition-colors hover:bg-subtle-gray"
          onclick={onSecondaryAction}
        >
          <Icon name={secondaryActionIcon} size={13} />
          {secondaryActionLabel}
        </button>
      {/if}
    </div>
  {/if}
</section>
