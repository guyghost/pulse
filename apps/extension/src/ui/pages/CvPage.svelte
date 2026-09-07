<script lang="ts">
  import { Button, Icon } from '@pulse/ui';
  import { subscribeMessages } from '$lib/shell/messaging/bridge';
  import { createCvExperienceDeps } from '$lib/shell/facades/cv-experience.facade';
  import {
    ensureLinkedInHostPermission,
    importLinkedInProfile,
    syncLinkedInProfileImport,
  } from '$lib/shell/facades/profile-sync.facade';
  import { showToast } from '$lib/shell/notifications/toast-service';
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

  let isImporting = $state(false);

  store.load();

  async function handleLinkedInImport(): Promise<void> {
    if (isImporting) {
      return;
    }
    isImporting = true;
    try {
      const granted = await ensureLinkedInHostPermission();
      if (!granted) {
        showToast('Autorisation LinkedIn refusée.', 'error');
        return;
      }
      const extracted = await importLinkedInProfile();
      if (!extracted.imported) {
        showToast(extracted.errorMessage, 'error');
        return;
      }
      const result = await syncLinkedInProfileImport(extracted.profile);
      if (result.imported) {
        const draftCount = result.profile.experiences.length;
        const added = result.addedCount;
        if (draftCount === 0) {
          showToast('Aucune expérience renseignée sur votre profil LinkedIn.', 'info');
        } else if (added === 0) {
          showToast('Vos expériences LinkedIn sont déjà présentes dans votre CV.', 'info');
        } else {
          showToast(
            `${added} expérience${added > 1 ? 's' : ''} LinkedIn importée${added > 1 ? 's' : ''} avec succès.`,
            'success'
          );
        }
      } else {
        showToast(result.errorMessage, 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "L'import LinkedIn a échoué.", 'error');
    } finally {
      isImporting = false;
    }
  }

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
      <Button variant="secondary" size="sm" onclick={handleLinkedInImport} disabled={isImporting}>
        <Icon name="download" size={14} />
        {isImporting ? 'Import…' : 'Importer LinkedIn'}
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

  <ExperienceFeed {store} />
</PageShell>
