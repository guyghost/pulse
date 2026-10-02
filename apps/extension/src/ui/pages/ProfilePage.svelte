<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { Icon } from '@pulse/ui';
  import ProfileSection from '../organisms/ProfileSection.svelte';
  import { SettingsPageController } from '$lib/state/settings-page.svelte';
  import { formatTJMRange } from '$lib/core/utils/format';
  import { showToast } from '$lib/shell/notifications/toast-service';
  import OfflineNotice from '../molecules/OfflineNotice.svelte';
  import PageHeader from '../molecules/PageHeader.svelte';
  import PageShell from '../templates/PageShell.svelte';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import {
    buildProfileImpactItems,
    buildProfileImpactSimulation,
  } from '$lib/core/profile/profile-impact';

  const { onNavigateToOnboarding }: { onNavigateToOnboarding?: () => void } = $props();
  const connection = getConnectionStore();
  const isOffline = $derived(connection.status === 'offline');

  const settings = new SettingsPageController({
    onNavigateToOnboarding: () => onNavigateToOnboarding?.(),
  });

  void settings.loadProfile();
  onDestroy(() => settings.destroy());

  const profileCompletionItems = $derived.by(() => {
    return buildProfileImpactItems({
      firstName: settings.firstName,
      jobTitle: settings.jobTitle,
      location: settings.profileLocation,
      remote: settings.profileRemote,
      tjmMin: settings.tjmMin,
      tjmMax: null,
      keywords: settings.profileKeywords,
    });
  });

  const missingProfileItems = $derived(
    profileCompletionItems.filter((item) => !item.complete).map((item) => item.label)
  );

  const profileImpactSimulation = $derived(buildProfileImpactSimulation(profileCompletionItems));
  const profileCompleteness = $derived(profileImpactSimulation.currentCompletion);
  const nextProfilePriority = $derived(profileImpactSimulation.prioritizedItems[0]);
  let profileEditor: HTMLElement | undefined = $state();
  let focusFieldLabel = $state('Prénom');

  const completionExplanation = $derived.by(() => {
    if (missingProfileItems.length === 0) {
      return 'Profil complet : MissionPulse peut utiliser toutes vos préférences pour classer les missions.';
    }

    const visibleMissingItems = missingProfileItems.slice(0, 2).join(', ');
    const remainingCount = missingProfileItems.length - 2;
    const missingSummary =
      remainingCount > 0
        ? `${visibleMissingItems} + ${remainingCount} autre${remainingCount > 1 ? 's' : ''}`
        : visibleMissingItems;

    return `Il manque ${missingProfileItems.length} élément${missingProfileItems.length > 1 ? 's' : ''} : ${missingSummary}.`;
  });

  const targetSummary = $derived(
    [
      settings.jobTitle || 'Poste non renseigné',
      settings.profileLocation || 'Lieu non renseigné',
      settings.tjmMin > 0
        ? formatTJMRange(settings.tjmMin || null, null, { minOnlyPrefix: 'à partir de' })
        : 'TJM non renseigné',
    ].join(' · ')
  );

  async function handleSave() {
    if (settings.isSavingProfile) {
      return;
    }
    await settings.saveProfile();
    if (!settings.profileError) {
      await showToast('Profil mis à jour', 'success');
    }
  }

  async function openProfileEditing(): Promise<void> {
    const labels: Record<string, string> = {
      keywords: 'Mots-clés',
      'tjm-min': 'TJM minimum',
      remote: 'Mode de travail',
      location: 'Localisation',
      'job-title': 'Poste recherché',
      'first-name': 'Prénom',
    };
    const label = labels[nextProfilePriority?.id ?? 'first-name'];
    focusFieldLabel = label;
    if (!settings.editingProfile) {
      settings.toggleProfileEditing();
    }
    await tick();
    const input = profileEditor?.querySelector<HTMLElement>(`[aria-label="${label}"]`);
    input?.focus();
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
</script>

<PageShell>
  <PageHeader
    eyebrow="Profil freelance"
    title={settings.firstName ? `Bonjour ${settings.firstName}` : 'Votre profil MissionPulse'}
    icon="user"
    description={targetSummary}
  >
    <div class="grid grid-cols-[1fr_auto] items-center gap-3">
      <div
        class="h-2 overflow-hidden rounded-full bg-subtle-gray"
        role="progressbar"
        aria-label="Complétude du profil"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={profileCompleteness}
      >
        <div
          class="h-full rounded-full bg-blueprint-blue transition-all duration-300"
          style={`width: ${profileCompleteness}%`}
        ></div>
      </div>
      <span class="text-meta font-medium text-text-primary">{profileCompleteness}%</span>
    </div>

    <div class="mt-3 flex items-start gap-2 rounded-xl bg-surface-white/55 px-3 py-2">
      <Icon
        name={missingProfileItems.length === 0 ? 'check-circle' : 'info'}
        size={14}
        class="mt-0.5 shrink-0 text-blueprint-blue"
      />
      <div class="min-w-0">
        <p class="text-caption font-medium leading-4 text-text-primary">{completionExplanation}</p>
        {#if missingProfileItems.length > 0}
          <p class="mt-0.5 text-caption leading-4 text-text-subtle">
            Complétez ces champs pour améliorer les requêtes, le scoring et les suggestions de
            candidature.
          </p>
        {/if}
      </div>
    </div>
    {#snippet footer()}
      {#if isOffline}
        <OfflineNotice
          description="Vous pouvez ajuster le profil localement, mais les effets sur les recherches et synchronisations seront visibles au retour réseau."
          action="Prochaine action : sauvegarder les critères critiques, puis relancer un scan quand la connexion revient."
        />
      {/if}
    {/snippet}
  </PageHeader>

  {#if settings.profileLoadError}
    <p role="alert" class="text-meta text-status-red-text">
      {settings.profileLoadError}
      <button type="button" class="underline" onclick={() => settings.loadProfile()}
        >Réessayer</button
      >
    </p>
  {:else if !settings.profileLoaded}
    <p role="status" class="text-meta text-text-subtle">Chargement du profil…</p>
  {:else if nextProfilePriority}
    <section class="section-card rounded-xl p-4" aria-label="Suggestion prioritaire">
      <p class="eyebrow">Prochaine étape</p>
      <h2 class="mt-1 text-body-lg font-semibold">Compléter : {nextProfilePriority.label}</h2>
      <p class="mt-2 text-meta text-text-subtle">{nextProfilePriority.action}</p>
      <button
        type="button"
        class="soft-ring mt-3 min-h-11 rounded-lg bg-blueprint-blue px-4 text-caption font-semibold text-white"
        disabled={settings.isSavingProfile}
        onclick={openProfileEditing}
      >
        Compléter {nextProfilePriority.label.toLowerCase()}
      </button>
    </section>
  {:else}
    <p class="rounded-xl bg-accent-green/8 px-4 py-3 text-meta font-medium" role="status">
      Profil prêt · Vos critères sont renseignés.
    </p>
  {/if}

  <div bind:this={profileEditor}>
    <ProfileSection
      bind:firstName={settings.firstName}
      bind:jobTitle={settings.jobTitle}
      bind:profileLocation={settings.profileLocation}
      bind:profileRemote={settings.profileRemote}
      bind:seniority={settings.seniority}
      bind:tjmMin={settings.tjmMin}
      bind:profileKeywords={settings.profileKeywords}
      bind:keywordInput={settings.keywordInput}
      {focusFieldLabel}
      editing={settings.editingProfile}
      isSaving={settings.isSavingProfile}
      profileSaved={settings.profileSaved}
      profileError={settings.profileError}
      onToggleEdit={() => {
        focusFieldLabel = 'Prénom';
        settings.toggleProfileEditing();
      }}
      onSave={handleSave}
      onAddKeyword={() => settings.addKeyword()}
      onRemoveKeyword={(keyword) => settings.removeKeyword(keyword)}
    />
  </div>

  <details class="section-card rounded-xl p-4">
    <summary class="cursor-pointer text-meta font-semibold"
      >Consulter les critères du profil</summary
    >
    <ul class="mt-3 space-y-3">
      {#each profileCompletionItems as item (item.id)}
        <li class="text-caption">
          <p class="font-medium">{item.label} · {item.complete ? 'Renseigné' : 'À compléter'}</p>
          <p class="mt-1 text-text-subtle">{item.impact}</p>
        </li>
      {/each}
    </ul>
  </details>
</PageShell>
