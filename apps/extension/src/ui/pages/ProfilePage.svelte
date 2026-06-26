<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Icon, type IconName } from '@pulse/ui';
  import ProfileSection from '../organisms/ProfileSection.svelte';
  import { SettingsPageController } from '$lib/state/settings-page.svelte';
  import { showToast } from '$lib/shell/notifications/toast-service';
  import OperationalStoryCard, {
    type OperationalEvidence,
  } from '../molecules/OperationalStoryCard.svelte';
  import OfflineNotice from '../molecules/OfflineNotice.svelte';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';
  import {
    buildProfileImpactItems,
    buildProfileImpactSimulation,
    type ProfileImpactItem,
  } from '$lib/core/profile/profile-impact';

  const { onNavigateToOnboarding }: { onNavigateToOnboarding?: () => void } = $props();
  const connection = getConnectionStore();
  const isOffline = $derived(connection.status === 'offline');

  const settings = new SettingsPageController({
    onNavigateToOnboarding: () => onNavigateToOnboarding?.(),
  });

  settings.load();
  onDestroy(() => settings.destroy());

  const profileCompletionItems = $derived.by(() => {
    return buildProfileImpactItems({
      firstName: settings.firstName,
      jobTitle: settings.jobTitle,
      location: settings.profileLocation,
      remote: settings.profileRemote,
      tjmMin: settings.tjmMin,
      tjmMax: settings.tjmMax,
      stack: settings.profileStack,
      searchKeywords: settings.searchKeywords,
    });
  });

  const missingProfileItems = $derived(
    profileCompletionItems.filter((item) => !item.complete).map((item) => item.label)
  );

  const profileImpactSimulation = $derived(buildProfileImpactSimulation(profileCompletionItems));
  const profileCompleteness = $derived(profileImpactSimulation.currentCompletion);
  const topProfilePriorities = $derived(profileImpactSimulation.prioritizedItems);

  const completionExplanation = $derived.by(() => {
    if (missingProfileItems.length === 0) {
      return 'Profil complet : MissionPulse peut utiliser toutes vos préférences pour matcher les missions.';
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
      settings.tjmMin > 0 || settings.tjmMax > 0
        ? `${settings.tjmMin}-${settings.tjmMax} €/j`
        : 'TJM non renseigné',
    ].join(' · ')
  );

  const profileStory = $derived.by(() => {
    const evidence: OperationalEvidence[] = [
      {
        label: 'Complétude',
        value: `${profileCompleteness}%`,
        icon: 'gauge',
        severity:
          profileCompleteness >= 85
            ? 'success'
            : profileCompleteness >= 55
              ? 'attention'
              : 'incident',
      },
      {
        label: 'Gain estimé',
        value: profileImpactSimulation.delta > 0 ? `+${profileImpactSimulation.delta}` : '0',
        icon: 'list-checks',
        severity: missingProfileItems.length === 0 ? 'success' : 'attention',
      },
      {
        label: 'Stack',
        value: settings.profileStack.length,
        icon: 'layers',
        severity: settings.profileStack.length > 0 ? 'success' : 'incident',
      },
    ];

    if (missingProfileItems.length === 0) {
      return {
        severity: 'success' as const,
        statusLabel: 'Prêt',
        title: 'Le profil peut mieux classer vos missions',
        description:
          'Les critères essentiels sont renseignés. Gardez ce profil de référence à jour avant de comparer les missions prioritaires.',
        evidence,
        primaryActionLabel: settings.isSavingProfile
          ? 'Sauvegarde...'
          : settings.editingProfile
            ? 'Enregistrer'
            : 'Modifier le profil',
        primaryActionIcon: settings.editingProfile ? 'save' : 'pencil',
      };
    }

    return {
      severity: profileCompleteness < 55 ? ('incident' as const) : ('attention' as const),
      statusLabel: 'À compléter',
      title: `${missingProfileItems.length} champ${missingProfileItems.length > 1 ? 's' : ''} manque${missingProfileItems.length > 1 ? 'nt' : ''} pour mieux classer vos missions`,
      description:
        'Les champs manquants réduisent la précision des requêtes et des suggestions de candidature.',
      evidence,
      primaryActionLabel: settings.isSavingProfile
        ? 'Sauvegarde...'
        : settings.editingProfile
          ? 'Enregistrer'
          : 'Modifier le profil',
      primaryActionIcon: settings.editingProfile ? 'save' : 'pencil',
    };
  });

  async function handleSave() {
    if (settings.isSavingProfile) {
      return;
    }
    await settings.saveProfile();
    if (!settings.profileError) {
      await showToast('Profil mis à jour', 'success');
    }
  }

  function profileImpactIcon(item: ProfileImpactItem): IconName {
    if (item.id === 'stack') {
      return 'layers';
    }
    if (item.id === 'tjm-min' || item.id === 'tjm-max') {
      return 'badge-euro';
    }
    if (item.id === 'remote') {
      return 'wifi';
    }
    if (item.id === 'location') {
      return 'target';
    }
    if (item.id === 'search-keywords') {
      return 'search';
    }
    if (item.id === 'job-title') {
      return 'briefcase';
    }
    return 'user';
  }

  function openProfileEditing(): void {
    if (!settings.editingProfile) {
      settings.toggleProfileEditing();
    }
  }
</script>

<div class="flex h-full flex-col overflow-y-auto px-4 pb-5 pt-4">
  <section class="section-card-strong rounded-2xl px-5 py-4">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="eyebrow text-blueprint-blue">Profil freelance</p>
        <h2 class="mt-1 text-base font-semibold text-text-primary">
          {settings.firstName ? `Bonjour ${settings.firstName}` : 'Votre profil MissionPulse'}
        </h2>
        <p class="mt-1 text-xs leading-5 text-text-subtle">{targetSummary}</p>
      </div>
      <div
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blueprint-blue/15 bg-blueprint-blue/6"
      >
        <Icon name="user" size={18} class="text-blueprint-blue" />
      </div>
    </div>

    <div class="mt-4 grid grid-cols-[1fr_auto] items-center gap-3">
      <div class="h-2 overflow-hidden rounded-full bg-subtle-gray">
        <div
          class="h-full rounded-full bg-blueprint-blue transition-all duration-300"
          style={`width: ${profileCompleteness}%`}
        ></div>
      </div>
      <span class="text-xs font-medium text-text-primary">{profileCompleteness}%</span>
    </div>

    <div class="mt-3 flex items-start gap-2 rounded-xl bg-surface-white/55 px-3 py-2">
      <Icon
        name={missingProfileItems.length === 0 ? 'check-circle' : 'info'}
        size={14}
        class="mt-0.5 shrink-0 text-blueprint-blue"
      />
      <div class="min-w-0">
        <p class="text-[11px] font-medium leading-4 text-text-primary">{completionExplanation}</p>
        {#if missingProfileItems.length > 0}
          <p class="mt-0.5 text-[11px] leading-4 text-text-subtle">
            Complétez ces champs pour améliorer les requêtes, le scoring et les suggestions de
            candidature.
          </p>
        {/if}
      </div>
    </div>

    <div class="mt-4">
      <OperationalStoryCard
        eyebrow="Impact du profil"
        title={profileStory.title}
        description={profileStory.description}
        severity={profileStory.severity}
        statusLabel={profileStory.statusLabel}
        evidence={profileStory.evidence}
        primaryActionLabel={profileStory.primaryActionLabel}
        primaryActionIcon={profileStory.primaryActionIcon}
        onPrimaryAction={() => {
          if (settings.isSavingProfile) {
            return;
          }
          if (settings.editingProfile) {
            handleSave();
            return;
          }
          settings.toggleProfileEditing();
        }}
      />
    </div>

    <div class="mt-4 border-t border-border-light pt-4" aria-label="Priorités d’impact profil">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="eyebrow text-text-muted">Priorités d’impact</p>
          <h3 class="mt-1 text-sm font-semibold leading-5 text-text-primary">
            {profileImpactSimulation.title}
          </h3>
          <p class="mt-1 text-xs leading-5 text-text-subtle">
            {profileImpactSimulation.description}
          </p>
        </div>
        <div
          class="shrink-0 rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/6 px-2.5 py-1.5 text-right"
        >
          <p class="text-[9px] uppercase tracking-[0.13em] text-text-muted">Gain</p>
          <p class="font-mono text-sm font-semibold text-blueprint-blue">
            {profileImpactSimulation.delta > 0 ? `+${profileImpactSimulation.delta}` : '0'}
          </p>
        </div>
      </div>

      {#if topProfilePriorities.length > 0}
        <div class="mt-3 space-y-2">
          {#each topProfilePriorities as item}
            <button
              type="button"
              class="group flex w-full items-start gap-3 rounded-lg border border-border-light bg-surface-white/65 px-3 py-2.5 text-left transition-colors hover:border-blueprint-blue/20 hover:bg-surface-white"
              onclick={openProfileEditing}
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6 text-blueprint-blue"
              >
                <Icon name={profileImpactIcon(item)} size={14} />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-center justify-between gap-2">
                  <span class="text-xs font-semibold text-text-primary">{item.label}</span>
                  <span class="font-mono text-[11px] text-text-muted">{item.weight}%</span>
                </span>
                <span class="mt-0.5 block text-[11px] leading-4 text-text-subtle">
                  {item.action}
                </span>
                <span class="mt-1 block text-[10px] leading-4 text-text-muted">
                  Impact : {item.impact}
                </span>
              </span>
              <Icon
                name="chevron-right"
                size={13}
                class="mt-2 shrink-0 text-text-muted transition-colors group-hover:text-blueprint-blue"
              />
            </button>
          {/each}
        </div>
      {:else}
        <div class="mt-3 flex items-center gap-2 text-xs text-text-subtle">
          <Icon name="check-circle" size={14} class="text-blueprint-blue" />
          <span>Stack, TJM, remote, localisation et mots-clés sont prêts pour le scoring.</span>
        </div>
      {/if}
    </div>
    {#if isOffline}
      <div class="mt-3">
        <OfflineNotice
          description="Vous pouvez ajuster le profil localement, mais les effets sur les recherches et synchronisations seront visibles au retour réseau."
          action="Prochaine action : sauvegarder les critères critiques, puis relancer un scan quand la connexion revient."
        />
      </div>
    {/if}
  </section>

  <div class="mt-4 space-y-4">
    <ProfileSection
      bind:firstName={settings.firstName}
      bind:jobTitle={settings.jobTitle}
      bind:profileLocation={settings.profileLocation}
      bind:profileRemote={settings.profileRemote}
      bind:seniority={settings.seniority}
      bind:tjmMin={settings.tjmMin}
      bind:tjmMax={settings.tjmMax}
      bind:profileStack={settings.profileStack}
      bind:stackInput={settings.stackInput}
      bind:searchKeywords={settings.searchKeywords}
      bind:keywordInput={settings.keywordInput}
      editing={settings.editingProfile}
      isSaving={settings.isSavingProfile}
      profileSaved={settings.profileSaved}
      profileError={settings.profileError}
      onToggleEdit={() => settings.toggleProfileEditing()}
      onSave={handleSave}
      onAddStack={() => settings.addStack()}
      onRemoveStack={(tech) => settings.removeStack(tech)}
      onAddKeyword={() => settings.addKeyword()}
      onRemoveKeyword={(keyword) => settings.removeKeyword(keyword)}
    />
  </div>
</div>
