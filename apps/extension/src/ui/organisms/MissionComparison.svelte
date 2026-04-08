<script lang="ts">
  import type { Mission } from '$lib/core/types/mission';
  import Icon from '../atoms/Icon.svelte';
  import Badge from '../atoms/Badge.svelte';

  const {
    missions,
    onClose,
  }: {
    missions: Mission[];
    onClose: () => void;
  } = $props();

  const remoteLabels: Record<string, string> = {
    full: 'Full remote',
    hybrid: 'Hybride',
    onsite: 'Sur site',
  };

  const fields: { label: string; key: string; render: (m: Mission) => string }[] = [
    { label: 'TJM', key: 'tjm', render: (m) => (m.tjm ? `${m.tjm} €/j` : '—') },
    { label: 'Localisation', key: 'location', render: (m) => m.location ?? '—' },
    {
      label: 'Remote',
      key: 'remote',
      render: (m) => (m.remote ? (remoteLabels[m.remote] ?? m.remote) : '—'),
    },
    { label: 'Durée', key: 'duration', render: (m) => m.duration ?? '—' },
    { label: 'Début', key: 'startDate', render: (m) => m.startDate ?? '—' },
    { label: 'Séniorité', key: 'seniority', render: (m) => m.seniority ?? '—' },
    {
      label: 'Score',
      key: 'score',
      render: (m) => {
        const s = m.semanticScore ?? m.score;
        return s !== null ? `${s}/100` : '—';
      },
    },
    { label: 'Source', key: 'source', render: (m) => m.source },
    { label: 'Client', key: 'client', render: (m) => m.client ?? '—' },
  ];
</script>

{#if missions.length >= 2}
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="w-full max-w-lg animate-slide-up rounded-t-3xl bg-navy-800 border border-white/10 max-h-[85vh] overflow-y-auto"
    >
      <!-- Header -->
      <div
        class="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-navy-800/95 backdrop-blur-sm px-4 py-3"
      >
        <h2 class="text-sm font-semibold text-text-primary">
          Comparaison ({missions.length} missions)
        </h2>
        <button
          class="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-white/10 hover:text-text-primary transition-colors"
          onclick={onClose}
          aria-label="Fermer"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <!-- Titles row -->
      <div
        class="grid border-b border-white/6 px-4 py-3"
        style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
      >
        <div class="text-[11px] uppercase tracking-[0.15em] text-text-muted self-end">Mission</div>
        {#each missions as mission}
          <div class="px-2">
            <a
              href={mission.url}
              target="_blank"
              rel="noopener"
              class="text-xs font-semibold text-accent-blue hover:underline line-clamp-2"
            >
              {mission.title}
            </a>
          </div>
        {/each}
      </div>

      <!-- Stack row -->
      <div
        class="grid border-b border-white/6 px-4 py-3"
        style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
      >
        <div class="text-[11px] uppercase tracking-[0.15em] text-text-muted">Stack</div>
        {#each missions as mission}
          <div class="flex flex-wrap gap-1 px-2">
            {#each mission.stack.slice(0, 5) as tech}
              <span
                class="inline-flex rounded-full bg-accent-blue/10 px-1.5 py-0.5 text-[10px] text-accent-blue"
                >{tech}</span
              >
            {/each}
            {#if mission.stack.length > 5}
              <span class="text-[10px] text-text-muted">+{mission.stack.length - 5}</span>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Data rows -->
      {#each fields as field, i}
        <div
          class="grid px-4 py-2.5 {i % 2 === 0 ? 'bg-white/[0.02]' : ''}"
          style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
        >
          <div class="text-[11px] uppercase tracking-[0.15em] text-text-muted">{field.label}</div>
          {#each missions as mission}
            <div class="px-2 text-xs text-text-primary">{field.render(mission)}</div>
          {/each}
        </div>
      {/each}

      <!-- Actions -->
      <div
        class="grid px-4 py-3 border-t border-white/6"
        style="grid-template-columns: 90px repeat({missions.length}, 1fr)"
      >
        <div></div>
        {#each missions as mission}
          <div class="px-2">
            <a
              href={mission.url}
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 rounded-lg bg-accent-blue/10 px-3 py-1.5 text-xs text-accent-blue hover:bg-accent-blue/20 transition-colors"
            >
              <Icon name="external-link" size={12} />
              Voir
            </a>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
