<script lang="ts">
  import { Icon, type IconName } from '@pulse/ui';
  import type { Snippet } from 'svelte';

  const {
    eyebrow,
    title,
    icon = null,
    badge = null,
    description = null,
    actions = null,
    children = null,
    footer = null,
  }: {
    eyebrow: string;
    title: string;
    icon?: IconName | null;
    badge?: string | null;
    description?: string | null;
    actions?: Snippet;
    children?: Snippet;
    footer?: Snippet;
  } = $props();
</script>

<section class="section-card-strong rounded-2xl px-5 py-4">
  <div class="flex flex-col items-stretch gap-3.5 sm:flex-row sm:items-start">
    <div class="flex min-w-0 flex-1 items-start gap-3.5">
      {#if icon}
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blueprint-blue/15 bg-blueprint-blue/6"
        >
          <Icon name={icon} size={16} class="text-blueprint-blue" />
        </div>
      {/if}
      <div class="min-w-0 flex-1">
        <p class="eyebrow eyebrow--blue">{eyebrow}</p>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <h1 class="text-subheading font-semibold text-text-primary">{title}</h1>
          {#if badge}
            <span
              class="rounded-md border border-border-light bg-page-canvas px-2 py-1 text-micro font-medium text-text-subtle"
            >
              {badge}
            </span>
          {/if}
        </div>
        {#if description}
          <p class="mt-1 text-meta leading-5 text-text-subtle">{description}</p>
        {/if}
      </div>
    </div>
    {#if actions}
      <div class="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
        {@render actions()}
      </div>
    {/if}
  </div>

  {#if children}
    <div class="mt-4">
      {@render children()}
    </div>
  {/if}

  {#if footer}
    <div class="mt-3">
      {@render footer()}
    </div>
  {/if}
</section>
