<script lang="ts">
  import { Button, Icon } from '@pulse/ui';
  import { subscribeMessages } from '$lib/shell/messaging/bridge';
  import {
    createCvExperienceDeps,
    getCvSyncTargets,
  } from '$lib/shell/facades/cv-experience.facade';
  import {
    ensureLinkedInHostPermission,
    importLinkedInProfile,
    syncLinkedInProfileImport,
  } from '$lib/shell/facades/profile-sync.facade';
  import { showToast } from '$lib/shell/notifications/toast-service';
  import { createCvExperienceStore } from '$lib/state/cv-experience.svelte';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import ExperienceFeed from '../organisms/ExperienceFeed.svelte';
  import CvSyncPanel from '../organisms/CvSyncPanel.svelte';
  import OfflineNotice from '../molecules/OfflineNotice.svelte';

  const connection = getConnectionStore();
  const isOffline = $derived(connection.status === 'offline');

  const { onNavigateToProfile }: { onNavigateToProfile?: () => void } = $props();

  const store = createCvExperienceStore(createCvExperienceDeps());
  const platforms = getCvSyncTargets();

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
          showToast(
            "Aucune expérience trouvée sur votre profil LinkedIn. Ouvrez votre profil LinkedIn, défilez jusqu'à la section Expérience, puis relancez l'import.",
            'info'
          );
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

<div class="flex h-full min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-auto px-4 pb-5 pt-4">
  {#if isOffline}
    <OfflineNotice
      title="Mode hors ligne"
      description="Vos modifications sont conservées localement. La synchronisation reprendra à la reconnexion."
    />
  {/if}

  <section class="section-card-strong shrink-0 rounded-2xl px-5 py-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-base font-semibold text-text-primary">CV &amp; expériences</h1>
        <p class="mt-1 max-w-prose text-xs leading-relaxed text-text-secondary">
          La source canonique de votre parcours. Chaque expérience renseignée ici est synchronisable
          vers vos plateformes connectées pour garder le même profil partout.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onclick={handleLinkedInImport}
          disabled={isImporting || store.isSyncing}
        >
          <Icon name="download" size={14} />
          {isImporting ? 'Import…' : 'Importer LinkedIn'}
        </Button>
        {#if onNavigateToProfile}
          <Button variant="secondary" size="sm" onclick={onNavigateToProfile}>
            <Icon name="sliders-horizontal" size={14} />
            Profil
          </Button>
        {/if}
      </div>
    </div>
  </section>

  <CvSyncPanel {store} {platforms} />

  <ExperienceFeed {store} />
</div>
