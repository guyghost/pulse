<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { UserProfile } from '$lib/core/types/profile';
  import type { ProfileFieldComparison } from '$lib/core/profile/profile-sync';
  import { getConnectorsMeta, openExternalUrl } from '$lib/shell/facades/feed-data.facade';
  import { getProfile } from '$lib/shell/facades/settings.facade';
  import {
    previewLinkedInProfile,
    syncLinkedInProfileImport,
    type LinkedInProfilePreviewResult,
    verifyProfilePage,
    type LinkedInProfileImportResult,
    type VerifyProfileResult,
  } from '$lib/shell/facades/profile-sync.facade';
  import { showToast } from '$lib/shell/notifications/toast-service';

  type ProfilePlatform = {
    id: string;
    name: string;
    icon: string;
    profileUrl: string;
    verificationUrl: string;
    kind: 'social' | 'connector';
    writeMode: 'manual' | 'automatic';
  };

  type SyncField = {
    id: string;
    label: string;
    value: string;
    quality: 'ready' | 'missing';
  };

  let profile = $state<UserProfile | null>(null);
  let isLoading = $state(true);
  let selectedPlatformId = $state('linkedin');
  let pushedPlatformIds = $state<Set<string>>(new Set());
  let verifyingPlatformId = $state<string | null>(null);
  let previewingLinkedIn = $state(false);
  let syncingLinkedIn = $state(false);
  let linkedInPreviewResult = $state<LinkedInProfilePreviewResult | null>(null);
  let linkedInImportResult = $state<LinkedInProfileImportResult | null>(null);
  let verificationResults = $state<Map<string, VerifyProfileResult>>(new Map());
  let selectedFieldIds = $state<Set<string>>(
    new Set(['title', 'summary', 'stack', 'location', 'remote', 'tjm'])
  );

  const profileUrls: Record<string, string> = {
    'cherry-pick': 'https://app.cherry-pick.io/candidates/41085',
    collective: 'https://app.collective.work/collective/guy-mandina-nzeza/profile?tab=1',
  };

  const platforms: ProfilePlatform[] = [
    {
      id: 'linkedin',
      name: 'LinkedIn',
      icon: 'https://www.google.com/s2/favicons?domain=linkedin.com&sz=32',
      profileUrl: 'https://www.linkedin.com/in/',
      verificationUrl: 'https://www.linkedin.com/in/',
      kind: 'social',
      writeMode: 'manual',
    },
    ...getConnectorsMeta().map((connector) => ({
      id: connector.id,
      name: connector.name,
      icon: connector.icon,
      profileUrl: profileUrls[connector.id] ?? connector.url,
      verificationUrl: profileUrls[connector.id] ?? connector.url,
      kind: 'connector' as const,
      writeMode: 'manual' as const,
    })),
  ];

  const selectedPlatform = $derived(
    platforms.find((platform) => platform.id === selectedPlatformId) ?? platforms[0]
  );

  const syncFields = $derived<SyncField[]>([
    {
      id: 'title',
      label: 'Titre',
      value: profile?.jobTitle ?? '',
      quality: profile?.jobTitle ? 'ready' : 'missing',
    },
    {
      id: 'summary',
      label: 'Résumé',
      value: buildSummary(profile),
      quality: profile?.jobTitle && profile.stack.length > 0 ? 'ready' : 'missing',
    },
    {
      id: 'stack',
      label: 'Stack',
      value: profile?.stack.join(', ') ?? '',
      quality: profile && profile.stack.length > 0 ? 'ready' : 'missing',
    },
    {
      id: 'location',
      label: 'Localisation',
      value: profile?.location ?? '',
      quality: profile?.location ? 'ready' : 'missing',
    },
    {
      id: 'remote',
      label: 'Mode de travail',
      value: formatRemote(profile?.remote ?? 'any'),
      quality: profile ? 'ready' : 'missing',
    },
    {
      id: 'tjm',
      label: 'TJM',
      value:
        profile && (profile.tjmMin > 0 || profile.tjmMax > 0)
          ? `${profile.tjmMin}-${profile.tjmMax} EUR/j`
          : '',
      quality: profile && (profile.tjmMin > 0 || profile.tjmMax > 0) ? 'ready' : 'missing',
    },
    {
      id: 'keywords',
      label: 'Mots-clés',
      value: profile?.searchKeywords.join(', ') ?? '',
      quality: profile && profile.searchKeywords.length > 0 ? 'ready' : 'missing',
    },
  ]);

  const readyFields = $derived(syncFields.filter((field) => field.quality === 'ready'));
  const selectedFields = $derived(syncFields.filter((field) => selectedFieldIds.has(field.id)));

  const profileCompleteness = $derived(
    syncFields.length === 0 ? 0 : Math.round((readyFields.length / syncFields.length) * 100)
  );

  const selectedPayload = $derived(buildPlatformPayload(selectedPlatform, selectedFields));
  const selectedVerification = $derived(verificationResults.get(selectedPlatform.id) ?? null);

  function buildSummary(value: UserProfile | null): string {
    if (!value) {
      return '';
    }

    const stack = value.stack.slice(0, 5).join(', ');
    const seniority = value.seniority === 'senior' ? 'senior' : value.seniority;
    const title = value.jobTitle || 'Freelance';
    const location = value.location ? ` basé à ${value.location}` : '';

    return `${title} ${seniority}${location}. Stack principale: ${stack || 'à compléter'}. TJM cible: ${value.tjmMin}-${value.tjmMax} EUR/j.`;
  }

  function formatRemote(value: UserProfile['remote']): string {
    switch (value) {
      case 'full':
        return 'Remote';
      case 'hybrid':
        return 'Hybride';
      case 'onsite':
        return 'Présentiel';
      case 'any':
        return 'Indifférent';
    }
  }

  function buildPlatformPayload(platform: ProfilePlatform, fields: SyncField[]): string {
    const lines = [
      `Mise à jour profil - ${platform.name}`,
      '',
      ...fields.map((field) => `${field.label}: ${field.value || 'A compléter'}`),
    ];

    return lines.join('\n');
  }

  function toggleField(fieldId: string): void {
    const next = new Set(selectedFieldIds);
    if (next.has(fieldId)) {
      next.delete(fieldId);
    } else {
      next.add(fieldId);
    }
    selectedFieldIds = next;
  }

  async function copyPayload(): Promise<void> {
    await navigator.clipboard.writeText(selectedPayload);
    await showToast('Bloc de mise à jour copié', 'success');
  }

  async function pushPlatform(platform: ProfilePlatform): Promise<void> {
    await navigator.clipboard.writeText(buildPlatformPayload(platform, selectedFields));
    pushedPlatformIds = new Set([...pushedPlatformIds, platform.id]);
    await openExternalUrl(platform.profileUrl).catch(() => {});
    await showToast(`${platform.name}: mise à jour prête à coller`, 'success');
  }

  async function verifyPlatform(platform: ProfilePlatform): Promise<void> {
    verifyingPlatformId = platform.id;
    try {
      const result = await verifyProfilePage(platform.verificationUrl, selectedFields);
      const next = new Map(verificationResults);
      next.set(platform.id, result);
      verificationResults = next;

      if (result.read.status === 'auth-required') {
        await showToast(`${platform.name}: connexion requise pour vérifier`, 'error');
        return;
      }

      if (result.read.status === 'blocked') {
        await showToast(`${platform.name}: lecture bloquée, vérification manuelle`, 'error');
        return;
      }

      await showToast(
        result.summary.mismatches === 0
          ? `${platform.name}: profil aligné`
          : `${platform.name}: écarts détectés`,
        result.summary.mismatches === 0 ? 'success' : 'info'
      );
    } finally {
      verifyingPlatformId = null;
    }
  }

  async function previewLinkedIn(): Promise<void> {
    previewingLinkedIn = true;
    try {
      const result = await previewLinkedInProfile();
      linkedInPreviewResult = result;
      linkedInImportResult = null;
      if (!result.extracted) {
        await showToast(`LinkedIn: ${result.errorMessage}`, 'error');
        return;
      }

      await showToast('Preview LinkedIn prête à synchroniser', 'success');
    } finally {
      previewingLinkedIn = false;
    }
  }

  async function confirmLinkedInSync(): Promise<void> {
    if (!linkedInPreviewResult?.extracted) {
      await showToast("Prévisualisez LinkedIn avant de synchroniser l'import", 'error');
      return;
    }

    syncingLinkedIn = true;
    try {
      const result = await syncLinkedInProfileImport(linkedInPreviewResult.profile);
      linkedInImportResult = result;
      if (!result.imported) {
        await showToast(`LinkedIn: ${result.errorMessage}`, 'error');
        return;
      }

      await showToast('Profil LinkedIn synchronisé vers le dashboard', 'success');
    } finally {
      syncingLinkedIn = false;
    }
  }

  function getVerificationLabel(result: VerifyProfileResult | null): string {
    if (!result) {
      return 'À vérifier';
    }
    if (result.read.status === 'auth-required') {
      return 'Connexion requise';
    }
    if (result.read.status === 'blocked') {
      return 'Bloqué';
    }
    if (result.summary.mismatches > 0) {
      return `${result.summary.mismatches} écart${result.summary.mismatches > 1 ? 's' : ''}`;
    }
    return 'Aligné';
  }

  function getPlatformStatusLabel(platform: ProfilePlatform): string {
    const result = verificationResults.get(platform.id) ?? null;
    if (result) {
      return getVerificationLabel(result);
    }
    return pushedPlatformIds.has(platform.id) ? 'Prêt' : 'À vérifier';
  }

  function getLinkedInRecoveryHint(errorCode: string): string {
    switch (errorCode) {
      case 'permission_required':
        return "Autorisez l'accès LinkedIn dans Chrome, puis relancez la preview.";
      case 'session_required':
        return 'Connectez-vous à LinkedIn dans le navigateur avant de relancer la preview.';
      case 'profile_not_found':
        return 'Ouvrez un onglet de profil LinkedIn public ou connecté avant de relancer.';
      case 'dom_changed':
        return "Le profil LinkedIn ne correspond plus au parser attendu; l'import manuel reste disponible.";
      case 'rate_limited_or_blocked':
        return 'Attendez la fin du blocage LinkedIn ou vérifiez le profil dans un nouvel onglet.';
      case 'sync_failed':
        return 'Gardez la preview ouverte et relancez la synchronisation vers le dashboard.';
      default:
        return "Relancez l'action ou gardez le CV canonique prêt pour une mise à jour manuelle.";
    }
  }

  function getComparisonRows(result: VerifyProfileResult | null): ProfileFieldComparison[] {
    return result?.comparisons ?? [];
  }

  async function pushAll(): Promise<void> {
    if (platforms.length === 0) {
      return;
    }

    await navigator.clipboard.writeText(selectedPayload);
    pushedPlatformIds = new Set(platforms.map((platform) => platform.id));
    await showToast('Mise à jour préparée pour toutes les plateformes', 'success');
  }

  (async () => {
    isLoading = true;
    profile = await getProfile();
    isLoading = false;
  })().catch(async () => {
    isLoading = false;
    await showToast('Impossible de charger le profil CV', 'error');
  });
</script>

<div class="flex h-full flex-col overflow-y-auto px-4 pb-5 pt-4">
  <section class="section-card-strong rounded-2xl px-5 py-4">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="eyebrow text-blueprint-blue">CV synchronisé</p>
        <h2 class="mt-1 text-base font-semibold text-text-primary">
          Homogénéiser le profil partout
        </h2>
        <p class="mt-1 text-xs leading-5 text-text-subtle">
          MissionPulse prépare une version canonique de votre CV pour LinkedIn et les plateformes de
          mission connectées.
        </p>
      </div>
      <div
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blueprint-blue/15 bg-blueprint-blue/6"
      >
        <Icon name="file-text" size={18} class="text-blueprint-blue" />
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

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button
        class="inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blueprint-blue/90 disabled:opacity-50"
        onclick={previewLinkedIn}
        disabled={previewingLinkedIn || syncingLinkedIn}
      >
        <Icon name="download" size={13} />
        {previewingLinkedIn ? 'Extraction...' : 'Prévisualiser LinkedIn'}
      </button>
      <span class="text-xs text-text-subtle">
        Ouvrez votre profil LinkedIn dans l'onglet actif, vérifiez la preview, puis synchronisez.
      </span>
    </div>
  </section>

  {#if isLoading}
    <div class="mt-4 section-card rounded-xl p-5 text-sm text-text-subtle">Chargement...</div>
  {:else}
    <div class="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <section class="space-y-4">
        {#if !profile}
          <div class="section-card rounded-xl p-5">
            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blueprint-blue/6"
              >
                <Icon name="info" size={14} class="text-blueprint-blue" />
              </div>
              <div>
                <h3 class="text-sm font-medium text-text-primary">Profil source à compléter</h3>
                <p class="mt-1 text-xs leading-5 text-text-subtle">
                  Ajoutez votre profil MissionPulse ou récupérez les informations depuis vos
                  plateformes avant de pousser une version homogène.
                </p>
              </div>
            </div>
          </div>
        {/if}

        <div class="section-card rounded-xl p-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-medium text-text-primary">Profil source</h3>
              <p class="mt-1 text-xs text-text-subtle">Champs utilisés pour l'homogénéisation.</p>
            </div>
            <button
              class="inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blueprint-blue/90"
              onclick={pushAll}
            >
              <Icon name="upload" size={13} />
              Tout préparer
            </button>
          </div>

          <div class="mt-4 space-y-2">
            {#each syncFields as field}
              <button
                class="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors {selectedFieldIds.has(
                  field.id
                )
                  ? 'border-blueprint-blue/25 bg-blueprint-blue/6'
                  : 'border-border-light bg-page-canvas hover:bg-subtle-gray'}"
                onclick={() => toggleField(field.id)}
              >
                <span class="min-w-0">
                  <span class="block text-xs font-medium text-text-primary">{field.label}</span>
                  <span class="mt-0.5 block truncate text-xs text-text-subtle">
                    {field.value || 'A compléter'}
                  </span>
                </span>
                <span
                  class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border {field.quality ===
                  'ready'
                    ? 'border-blueprint-blue/25 bg-blueprint-blue/8 text-blueprint-blue'
                    : 'border-border-light bg-surface-white text-text-muted'}"
                >
                  <Icon name={selectedFieldIds.has(field.id) ? 'check' : 'plus'} size={11} />
                </span>
              </button>
            {/each}
          </div>
        </div>

        <div class="section-card rounded-xl p-5">
          <h3 class="text-sm font-medium text-text-primary">Aperçu à pousser</h3>
          <pre
            class="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-border-light bg-page-canvas p-3 text-xs leading-5 text-text-secondary">{selectedPayload}</pre>
          <button
            class="mt-3 inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray"
            onclick={copyPayload}
          >
            <Icon name="check" size={13} />
            Copier
          </button>
        </div>

        {#if linkedInPreviewResult}
          <div
            class="section-card rounded-xl border p-5 {linkedInPreviewResult.extracted
              ? 'border-blueprint-blue/20'
              : 'border-status-orange/20'}"
          >
            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {linkedInPreviewResult.extracted
                  ? 'bg-blueprint-blue/8 text-blueprint-blue'
                  : 'bg-status-orange/10 text-status-orange'}"
              >
                <Icon name={linkedInPreviewResult.extracted ? 'eye' : 'alert-triangle'} size={14} />
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-medium text-text-primary">Preview LinkedIn</h3>
                {#if linkedInPreviewResult.extracted}
                  <p class="mt-1 text-xs leading-5 text-text-subtle">
                    {linkedInPreviewResult.profile.title || 'Titre non renseigné'} ·
                    {linkedInPreviewResult.profile.experiences.length} expérience(s),
                    {linkedInPreviewResult.profile.skills.length} compétence(s),
                    {linkedInPreviewResult.profile.education.length} formation(s).
                  </p>
                  {#if linkedInPreviewResult.profile.summary}
                    <p
                      class="mt-3 max-h-24 overflow-auto rounded-lg border border-border-light bg-page-canvas p-3 text-xs leading-5 text-text-secondary"
                    >
                      {linkedInPreviewResult.profile.summary}
                    </p>
                  {/if}
                  <div class="mt-3 flex flex-wrap gap-2">
                    {#each linkedInPreviewResult.profile.skills.slice(0, 8) as skill}
                      <span
                        class="rounded-md bg-blueprint-blue/8 px-2 py-1 text-[10px] font-medium text-blueprint-blue"
                      >
                        {skill.skill}
                      </span>
                    {/each}
                  </div>
                  <div class="mt-4 flex flex-wrap gap-2 border-t border-border-light pt-3">
                    <button
                      class="inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blueprint-blue/90 disabled:opacity-50"
                      onclick={confirmLinkedInSync}
                      disabled={syncingLinkedIn || previewingLinkedIn}
                    >
                      <Icon name="upload" size={13} />
                      {syncingLinkedIn ? 'Synchronisation...' : 'Synchroniser le CV'}
                    </button>
                    <button
                      class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray disabled:opacity-50"
                      onclick={previewLinkedIn}
                      disabled={syncingLinkedIn || previewingLinkedIn}
                    >
                      <Icon name="refresh-cw" size={13} />
                      Réextraire
                    </button>
                  </div>
                {:else}
                  <p class="mt-1 text-xs leading-5 text-text-subtle">
                    {linkedInPreviewResult.errorCode}: {linkedInPreviewResult.errorMessage}
                  </p>
                  <p class="mt-2 text-xs leading-5 text-text-secondary">
                    {getLinkedInRecoveryHint(linkedInPreviewResult.errorCode)}
                  </p>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        {#if linkedInImportResult}
          <div
            class="section-card rounded-xl border p-5 {linkedInImportResult.imported
              ? 'border-blueprint-blue/20'
              : 'border-status-orange/20'}"
          >
            <div class="flex items-start gap-3">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {linkedInImportResult.imported
                  ? 'bg-blueprint-blue/8 text-blueprint-blue'
                  : 'bg-status-orange/10 text-status-orange'}"
              >
                <Icon name={linkedInImportResult.imported ? 'check' : 'alert-triangle'} size={14} />
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-medium text-text-primary">Import LinkedIn</h3>
                {#if linkedInImportResult.imported}
                  <p class="mt-1 text-xs leading-5 text-text-subtle">
                    Profil CV synchronisé dans Supabase. Le dashboard affichera l'import, les
                    suggestions de champs et l'historique LinkedIn.
                  </p>
                {:else}
                  <p class="mt-1 text-xs leading-5 text-text-subtle">
                    {linkedInImportResult.errorCode}: {linkedInImportResult.errorMessage}
                  </p>
                  <p class="mt-2 text-xs leading-5 text-text-secondary">
                    {getLinkedInRecoveryHint(linkedInImportResult.errorCode)}
                  </p>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        {#if selectedVerification}
          <div class="section-card rounded-xl p-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-sm font-medium text-text-primary">Vérification</h3>
                <p class="mt-1 text-xs text-text-subtle">
                  {selectedVerification.read.finalUrl}
                </p>
              </div>
              <span class="rounded-md bg-subtle-gray px-2 py-1 text-[10px] text-text-subtle">
                {getVerificationLabel(selectedVerification)}
              </span>
            </div>

            {#if selectedVerification.read.status !== 'available'}
              <p class="mt-3 text-xs leading-5 text-text-subtle">
                La page renvoie une connexion ou un contenu non exploitable depuis l'extension.
                Ouvrez la plateforme puis relancez la vérification.
              </p>
            {:else}
              <div class="mt-3 space-y-2">
                {#each getComparisonRows(selectedVerification) as row}
                  <div
                    class="flex items-center justify-between gap-3 rounded-lg bg-page-canvas px-3 py-2"
                  >
                    <div class="min-w-0">
                      <p class="text-xs font-medium text-text-primary">{row.label}</p>
                      <p class="truncate text-[11px] text-text-subtle">
                        {row.expected || 'A compléter'}
                      </p>
                    </div>
                    <span
                      class="rounded-md px-2 py-0.5 text-[10px] font-medium {row.status === 'match'
                        ? 'bg-blueprint-blue/8 text-blueprint-blue'
                        : row.status === 'mismatch'
                          ? 'bg-status-orange/10 text-status-orange'
                          : 'bg-subtle-gray text-text-muted'}"
                    >
                      {row.status === 'match'
                        ? 'OK'
                        : row.status === 'mismatch'
                          ? 'Écart'
                          : 'Manquant'}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </section>

      <section class="section-card rounded-xl p-3">
        <div class="flex items-center justify-between px-2 pb-2">
          <h3 class="text-sm font-medium text-text-primary">Plateformes</h3>
          <span class="text-xs text-text-muted">{platforms.length}</span>
        </div>

        <div class="space-y-2">
          {#each platforms as platform}
            <article
              class="rounded-lg border p-3 transition-colors {selectedPlatformId === platform.id
                ? 'border-blueprint-blue/30 bg-blueprint-blue/6'
                : 'border-border-light bg-page-canvas'}"
            >
              <button
                class="flex w-full items-start gap-3 text-left"
                onclick={() => {
                  selectedPlatformId = platform.id;
                }}
              >
                <img
                  src={platform.icon}
                  alt=""
                  class="mt-0.5 h-6 w-6 rounded-md border border-border-light bg-surface-white"
                />
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium text-text-primary">{platform.name}</span>
                  <span class="mt-1 block text-xs text-text-subtle">
                    {platform.writeMode === 'automatic'
                      ? 'Mise à jour automatique'
                      : 'Copie + ouverture du profil'}
                  </span>
                </span>
                <span
                  class="rounded-md px-2 py-0.5 text-[10px] font-medium {pushedPlatformIds.has(
                    platform.id
                  )
                    ? 'bg-blueprint-blue/8 text-blueprint-blue'
                    : 'bg-surface-white text-text-muted'}"
                >
                  {getPlatformStatusLabel(platform)}
                </span>
              </button>

              <div class="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
                <button
                  class="inline-flex items-center justify-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray disabled:opacity-50"
                  onclick={() => verifyPlatform(platform)}
                  disabled={verifyingPlatformId !== null}
                >
                  <Icon name="eye" size={13} />
                  {verifyingPlatformId === platform.id ? '...' : 'Vérifier'}
                </button>
                <button
                  class="inline-flex items-center justify-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blueprint-blue/90"
                  onclick={() => pushPlatform(platform)}
                >
                  <Icon name="upload" size={13} />
                  Pousser
                </button>
                <a
                  href={platform.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-muted transition-colors hover:bg-subtle-gray hover:text-text-primary"
                  title={`Ouvrir ${platform.name}`}
                >
                  <Icon name="external-link" size={13} />
                </a>
              </div>
            </article>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>
