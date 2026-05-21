<script lang="ts">
  import { Icon } from '@pulse/ui';
  import ProfileSection from '../organisms/ProfileSection.svelte';
  import { SettingsPageController } from '$lib/state/settings-page.svelte';
  import { showToast } from '$lib/shell/notifications/toast-service';

  const { onNavigateToOnboarding }: { onNavigateToOnboarding?: () => void } = $props();

  const settings = new SettingsPageController({
    onNavigateToOnboarding: () => onNavigateToOnboarding?.(),
  });

  settings.load();

  const profileCompleteness = $derived.by(() => {
    const checks = [
      settings.firstName.trim().length > 0,
      settings.jobTitle.trim().length > 0,
      settings.profileLocation.trim().length > 0,
      settings.profileStack.length > 0,
      settings.tjmMin > 0,
      settings.tjmMax > 0,
      settings.searchKeywords.length > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
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

    <section class="section-card rounded-xl p-5">
      <div class="flex items-start gap-3">
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6"
        >
          <Icon name="radar" size={14} class="text-blueprint-blue" />
        </div>
        <div>
          <h3 class="text-sm font-medium text-text-primary">Impact sur le matching</h3>
          <p class="mt-1 text-xs leading-5 text-text-subtle">
            Ces informations pilotent les requêtes connecteurs, le scoring des missions et les
            textes de candidature générés.
          </p>
        </div>
      </div>
    </section>
  </div>
</div>
