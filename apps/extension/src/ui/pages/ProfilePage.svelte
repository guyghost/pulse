<script lang="ts">
  import { Icon } from '@pulse/ui';
  import ProfileSection from '../organisms/ProfileSection.svelte';
  import { SettingsPageController } from '$lib/state/settings-page.svelte';
  import { showToast } from '$lib/shell/notifications/toast-service';
  import OperationalStoryCard, {
    type OperationalEvidence,
  } from '../molecules/OperationalStoryCard.svelte';
  import OfflineNotice from '../molecules/OfflineNotice.svelte';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';

  const { onNavigateToOnboarding }: { onNavigateToOnboarding?: () => void } = $props();
  const connection = getConnectionStore();
  const isOffline = $derived(connection.status === 'offline');

  const settings = new SettingsPageController({
    onNavigateToOnboarding: () => onNavigateToOnboarding?.(),
  });

  settings.load();

  const profileCompletionItems = $derived.by(() => {
    return [
      {
        complete: settings.firstName.trim().length > 0,
        label: 'Prénom',
        impact: 'personnalise les textes générés',
      },
      {
        complete: settings.jobTitle.trim().length > 0,
        label: 'Poste cible',
        impact: 'cadre les recherches connecteurs',
      },
      {
        complete: settings.profileLocation.trim().length > 0,
        label: 'Localisation',
        impact: 'pondère les missions proches ou hybrides',
      },
      {
        complete: settings.profileStack.length > 0,
        label: 'Stack technique',
        impact: 'alimente le scoring de pertinence',
      },
      {
        complete: settings.tjmMin > 0,
        label: 'TJM minimum',
        impact: 'filtre les missions sous votre plancher',
      },
      {
        complete: settings.tjmMax > 0,
        label: 'TJM maximum',
        impact: 'calibre les fourchettes réalistes',
      },
      {
        complete: settings.searchKeywords.length > 0,
        label: 'Mots-clés de recherche',
        impact: 'enrichit les requêtes envoyées aux plateformes',
      },
    ];
  });

  const missingProfileItems = $derived(
    profileCompletionItems.filter((item) => !item.complete).map((item) => item.label)
  );

  const profileCompleteness = $derived.by(() => {
    const checks = profileCompletionItems.map((item) => item.complete);
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  });

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
        label: 'Completude',
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
        label: 'Champs',
        value: missingProfileItems.length,
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
        statusLabel: 'Pret',
        title: 'Le profil peut alimenter le scoring et les generations',
        description:
          'Les criteres essentiels sont renseignes. Gardez cette source canonique a jour avant de comparer les missions prioritaires.',
        evidence,
        primaryActionLabel: settings.editingProfile ? 'Enregistrer' : 'Modifier le profil',
        primaryActionIcon: settings.editingProfile ? 'save' : 'pencil',
      };
    }

    return {
      severity: profileCompleteness < 55 ? ('incident' as const) : ('attention' as const),
      statusLabel: 'A completer',
      title: `${missingProfileItems.length} element${missingProfileItems.length > 1 ? 's' : ''} limite${missingProfileItems.length > 1 ? 'nt' : ''} la qualite du radar`,
      description:
        'Les champs manquants reduisent la precision des requetes, du scoring et des suggestions de candidature.',
      evidence,
      primaryActionLabel: settings.editingProfile ? 'Enregistrer' : 'Modifier le profil',
      primaryActionIcon: settings.editingProfile ? 'save' : 'pencil',
    };
  });

  async function handleSave() {
    await settings.saveProfile();
    if (!settings.profileError) {
      await showToast('Profil mis à jour', 'success');
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
        eyebrow="Impact scoring"
        title={profileStory.title}
        description={profileStory.description}
        severity={profileStory.severity}
        statusLabel={profileStory.statusLabel}
        evidence={profileStory.evidence}
        primaryActionLabel={profileStory.primaryActionLabel}
        primaryActionIcon={profileStory.primaryActionIcon}
        onPrimaryAction={() => {
          if (settings.editingProfile) {
            handleSave();
            return;
          }
          settings.toggleProfileEditing();
        }}
      />
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
