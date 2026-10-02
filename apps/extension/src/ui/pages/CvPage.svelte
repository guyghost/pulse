<script lang="ts">
  import { Button, Icon } from '@pulse/ui';
  import { subscribeMessages } from '$lib/shell/messaging/bridge';
  import { createCvExperienceDeps } from '$lib/shell/facades/cv-experience.facade';
  import { createCvImportStore } from '$lib/state/cv-import.svelte';
  import CvExportPanel from '../organisms/CvExportPanel.svelte';
  import { createCvExperienceStore } from '$lib/state/cv-experience.svelte';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import ExperienceFeed from '../organisms/ExperienceFeed.svelte';
  import OfflineNotice from '../molecules/OfflineNotice.svelte';
  import PageHeader from '../molecules/PageHeader.svelte';
  import PageShell from '../templates/PageShell.svelte';

  const connection = getConnectionStore();
  const isOffline = $derived(connection.status === 'offline');

  const { onNavigateToProfile }: { onNavigateToProfile?: () => void } = $props();

  const store = createCvExperienceStore(createCvExperienceDeps());

  const importer = createCvImportStore((experiences) => store.applyProfileUpdate(experiences));
  store.load();

  $effect(() => {
    const unsubscribe = subscribeMessages((message) => {
      if (message.type === 'PROFILE_UPDATED') {
        // External merge (e.g. LinkedIn import). Respects invariants: dropped
        // during in-flight save/delete/sync and active edit.
        store.applyProfileUpdate(message.payload.experiences ?? []);
      }
    });
    return unsubscribe;
  });
</script>

<PageShell>
  <PageHeader
    eyebrow="Parcours"
    title="CV &amp; expériences"
    icon="file-text"
    description="La source canonique de votre parcours, à conserver à jour avant de candidater sur vos plateformes."
  >
    {#snippet actions()}
      <Button
        variant="secondary"
        size="sm"
        onclick={() => importer.extract()}
        disabled={importer.busy ||
          importer.draft !== null ||
          store.editStatus !== 'idle' ||
          store.feedStatus !== 'ready'}
      >
        <Icon name="download" size={14} />
        {importer.busy ? 'Import…' : 'Importer LinkedIn'}
      </Button>
      {#if onNavigateToProfile}
        <Button variant="secondary" size="sm" onclick={onNavigateToProfile}>
          <Icon name="sliders-horizontal" size={14} />
          Profil
        </Button>
      {/if}
    {/snippet}
    {#snippet footer()}
      {#if isOffline}
        <OfflineNotice
          title="Mode hors ligne"
          description="Vos modifications sont conservées localement et resteront disponibles au retour en ligne."
        />
      {/if}
    {/snippet}
  </PageHeader>

  {#if importer.error}<p role="alert" class="text-meta text-status-red">{importer.error}</p>{/if}
  {#if importer.status}<p role="status" class="text-meta">{importer.status}</p>{/if}
  {#if importer.draft}
    <section class="section-card space-y-3 rounded-xl p-4" aria-label="Prévisualisation LinkedIn">
      <h2 class="text-body-lg font-semibold">Vérifier l’import LinkedIn</h2>
      <p class="text-meta text-text-subtle">
        Seules les expériences cochées seront fusionnées. Vos expériences manuelles, votre titre et
        vos mots-clés de profil sont conservés.
      </p>
      {#each importer.rows as row, index (index)}
        <div class="space-y-2 rounded-lg border border-border-light p-3">
          <label class="flex items-start gap-2 text-meta font-medium"
            ><input
              type="checkbox"
              checked={importer.selected.includes(index)}
              disabled={importer.busy || row.status === 'identical'}
              onchange={() => importer.toggle(index)}
            /><span
              >{row.draft.title} · {row.draft.company ?? 'Entreprise non renseignée'} — {row.status ===
              'new'
                ? 'Nouvelle'
                : row.status === 'modified'
                  ? 'Modifiée'
                  : 'Identique'}</span
            ></label
          >
          {#if row.status === 'modified' && row.current}
            <details>
              <summary class="cursor-pointer text-meta">Version actuelle</summary>
              <p class="whitespace-pre-wrap text-meta">
                {row.current.title} · {row.current.company} · {row.current.location} · {row.current
                  .employmentType}<br />{row.current.startDate} → {row.current.isCurrent
                  ? 'présent'
                  : row.current.endDate}<br />{row.current.description}<br
                />{row.current.skills.join(' · ')}
              </p>
            </details>
          {/if}
          <p class="whitespace-pre-wrap text-meta text-text-subtle">
            {row.proposed.title} · {row.proposed.company} · {row.proposed.location} · {row.proposed
              .employmentType}<br />{row.proposed.startDate} → {row.proposed.isCurrent
              ? 'présent'
              : row.proposed.endDate}<br />{row.proposed.description}<br
            />{row.proposed.skills.join(' · ')}
          </p>
          {#if row.current?.source === 'manual'}<p class="text-caption">
              Votre saisie manuelle est conservée intégralement.
            </p>{/if}
        </div>
      {/each}
      <div class="flex flex-wrap gap-2">
        <Button
          onclick={() => importer.confirm()}
          disabled={importer.busy || importer.selected.length === 0}
          >Confirmer la sélection ({importer.selected.length})</Button
        ><Button variant="secondary" onclick={() => importer.cancel()} disabled={importer.busy}
          >Annuler l’import</Button
        >
      </div>
    </section>
  {:else if importer.busy}
    <p role="status" class="text-meta">Récupération du profil LinkedIn…</p>
  {:else}
    <ExperienceFeed {store} />
    <CvExportPanel />
  {/if}
</PageShell>
