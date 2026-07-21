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

  export type OperationalStoryVariant = 'full' | 'compact' | 'inline';

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
    variant = null,
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
    /** Display variant. Wins over the legacy `compact` boolean. */
    variant?: OperationalStoryVariant | null;
    /** Legacy: true maps to 'compact'. Prefer `variant`. */
    compact?: boolean;
    onPrimaryAction?: () => void;
    onSecondaryAction?: () => void;
  } = $props();

  // `variant` is the source of truth; `compact=true` is a legacy alias.
  const resolvedVariant = $derived<OperationalStoryVariant>(
    variant ?? (compact ? 'compact' : 'full')
  );

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

  const iconName = $derived(
    severity === 'success'
      ? 'shield-check'
      : severity === 'attention'
        ? 'circle-alert'
        : severity === 'incident' || severity === 'critical'
          ? 'triangle-alert'
          : 'radar'
  );

  function evidenceClass(itemSeverity: OperationalSeverity | undefined): string {
    // Severity hue is carried by the card border/background and the leading icon
    // chip; the evidence value stays in neutral ink so the figure stays legible
    // (semantic-colored small numerals fell below WCAG AA).
    return 'text-text-primary';
  }
</script>

{#if resolvedVariant === 'inline'}
  <!-- Compact decision strip: icon + stable status + flexible action. -->
  <section
    data-testid="operational-story-inline"
    aria-label={eyebrow ? `${eyebrow} : ${title}` : title}
    class="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 rounded-xl border px-3 py-2 transition-colors {containerClass}"
  >
    <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md {iconClass}">
      <Icon name={iconName} size={13} />
    </div>
    {#if statusLabel}
      <OperationalStatusBadge label={statusLabel} {severity} />
    {:else}
      <p class="truncate text-xs font-medium text-text-primary">{title}</p>
    {/if}
    {#if primaryActionLabel}
      <button
        class="inline-flex min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-blueprint-blue transition-colors hover:bg-blueprint-blue/8"
        onclick={onPrimaryAction}
        type="button"
      >
        <span class="min-w-0 truncate">{primaryActionLabel}</span>
        <Icon name={primaryActionIcon} size={12} class="shrink-0" />
      </button>
    {:else if statusLabel}
      <p class="min-w-0 truncate text-xs font-medium text-text-primary">{title}</p>
    {/if}
  </section>
{:else}
  <section
    class="rounded-xl border p-4 transition-colors {containerClass} {resolvedVariant === 'compact'
      ? 'space-y-3'
      : 'space-y-4'}"
  >
    <div class="flex items-start gap-3">
      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg {iconClass}">
        <Icon name={iconName} size={16} />
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
        {#if description && resolvedVariant === 'full'}
          <p class="mt-1 text-xs leading-5 text-text-subtle">{description}</p>
        {/if}
      </div>
    </div>

    {#if evidence.length > 0}
      <div class="grid grid-cols-3 gap-2">
        {#each evidence as item, i (i)}
          <div class="rounded-lg border border-border-light bg-surface-white/70 px-3 py-2">
            <p
              class="flex items-center gap-1 text-[9px] uppercase tracking-[0.13em] text-text-muted"
            >
              {#if item.icon}
                <Icon name={item.icon} size={10} />
              {/if}
              {item.label}
            </p>
            <p
              class="mt-1 font-mono text-sm font-semibold tabular-nums {evidenceClass(
                item.severity
              )}"
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
            class="inline-flex items-center gap-2 rounded-lg bg-blueprint-blue-strong px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blueprint-blue-strong/90"
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
{/if}
