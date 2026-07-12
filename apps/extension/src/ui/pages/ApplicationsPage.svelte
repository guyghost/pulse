<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { Mission } from '$lib/core/types/mission';
  import type { GeneratedAsset, GenerationType } from '$lib/core/types/generation';
  import { GENERATION_TYPE_ICONS, GENERATION_TYPE_LABELS } from '$lib/core/types/generation';
  import type {
    ApplicationStatus,
    MissionTracking,
    StatusTransition,
  } from '$lib/core/types/tracking';
  import { STATUS_LABELS, VALID_TRANSITIONS } from '$lib/core/types/tracking';
  import { getMissions } from '$lib/shell/facades/feed-data.facade';
  import {
    createAvailabilityDeps,
    getAvailabilityPushTargets,
  } from '$lib/shell/facades/availability.facade';
  import { createTrackingStore } from '$lib/state/tracking.svelte';
  import { createAvailabilityStore } from '$lib/state/availability.svelte';
  import { sendMessage, subscribeMessages } from '$lib/shell/messaging/bridge';
  import { showToast, showToastAction } from '$lib/shell/notifications/toast-service';
  import {
    summarizeApplicationPipeline,
    isDueFollowUp,
    isTerminalStatus,
  } from '$lib/core/tracking/pipeline-summary';
  import ApplicationPipelineSummary from '../organisms/ApplicationPipelineSummary.svelte';
  import AvailabilityPanel from '../organisms/AvailabilityPanel.svelte';
  import OperationalStoryCard, {
    type OperationalEvidence,
  } from '../molecules/OperationalStoryCard.svelte';
  import OperationalEmptyState from '../molecules/OperationalEmptyState.svelte';
  import OfflineNotice from '../molecules/OfflineNotice.svelte';
  import { getConnectionStore } from '$lib/state/connection-singleton.svelte';

  const { onNavigateToFeed }: { onNavigateToFeed?: () => void } = $props();
  const connection = getConnectionStore();
  const isOffline = $derived(connection.status === 'offline');

  const tracking = createTrackingStore();
  const availabilityStore = createAvailabilityStore(createAvailabilityDeps());
  const availabilityPlatforms = getAvailabilityPushTargets();

  void availabilityStore.load();

  $effect(() => {
    const unsubscribe = subscribeMessages((message) => {
      if (message.type === 'PROFILE_UPDATED') {
        availabilityStore.applyProfileUpdate(message.payload.availability ?? null);
      }
    });
    return unsubscribe;
  });

  let missions = $state<Mission[]>([]);
  let isLoading = $state(true);
  let selectedMissionId = $state<string | null>(null);
  let assets = $state<GeneratedAsset[]>([]);
  let generatingType = $state<GenerationType | null>(null);
  let nextActionInput = $state('');
  let loadError = $state<string | null>(null);

  const generationTypes: GenerationType[] = ['pitch', 'cover-message', 'cv-summary'];

  type TrackedMission = {
    mission: Mission;
    record: MissionTracking;
  };

  type LoadingProgressStep = {
    label: string;
    detail: string;
    icon: 'database' | 'activity' | 'sparkles';
  };

  const loadingProgressSteps: LoadingProgressStep[] = [
    {
      label: 'Missions locales',
      detail: 'Lecture du feed stocké pour retrouver les dossiers qualifiables.',
      icon: 'database',
    },
    {
      label: 'Statuts de suivi',
      detail: 'Reprise des relances, étapes et notes enregistrées dans le pipeline.',
      icon: 'activity',
    },
    {
      label: 'Kits générés',
      detail: 'Préparation des pitchs, messages et résumés liés aux candidatures.',
      icon: 'sparkles',
    },
  ];

  const trackedMissions = $derived.by(() => {
    return missions
      .map((mission) => ({
        mission,
        record: tracking.getTrackingForMission(mission.id) ?? null,
      }))
      .filter(
        (item): item is TrackedMission =>
          item.record !== null && item.record.currentStatus !== 'detected'
      )
      .sort((a, b) => getLastActivity(b.record) - getLastActivity(a.record));
  });

  const selectedMission = $derived(
    missions.find((mission) => mission.id === selectedMissionId) ?? missions[0] ?? null
  );

  const selectedTracking = $derived(
    selectedMission ? tracking.getTrackingForMission(selectedMission.id) : null
  );

  const selectedStatus = $derived<ApplicationStatus>(selectedTracking?.currentStatus ?? 'detected');
  const nextStatuses = $derived<ApplicationStatus[]>(VALID_TRANSITIONS[selectedStatus] ?? []);
  const selectedDecisionHistory = $derived.by(() =>
    selectedTracking ? selectedTracking.history.slice().reverse().slice(0, 4) : []
  );

  $effect(() => {
    nextActionInput = isoToDateTimeLocal(selectedTracking?.nextActionAt ?? null);
  });

  const pipelineSummary = $derived.by(() =>
    summarizeApplicationPipeline([...tracking.trackings.values()], Date.now())
  );

  const recommendedTrackedMission = $derived.by(() => {
    const now = Date.now();
    // Terminal missions (accepted/rejected/archived) are outcomes, not actionable
    // dossiers — never recommend them, even when a stale nextActionAt survives.
    const actionable = trackedMissions.filter(
      ({ record }) => !isTerminalStatus(record.currentStatus)
    );

    const dueMission = [...actionable]
      .filter(({ record }) => isDueFollowUp(record, now))
      .sort((a, b) => getNextActionTimestamp(a.record) - getNextActionTimestamp(b.record))[0];

    if (dueMission) {
      return dueMission;
    }

    const preparedMission = actionable.find(
      ({ record }) => record.currentStatus === 'application_prepared'
    );

    return preparedMission ?? actionable[0] ?? null;
  });

  const applicationStory = $derived.by(() => {
    const evidence: OperationalEvidence[] = [
      {
        label: 'Actives',
        value: pipelineSummary.activeCount,
        icon: 'activity',
        severity: pipelineSummary.activeCount > 0 ? 'success' : 'neutral',
      },
      {
        label: 'Relances',
        value: pipelineSummary.dueFollowUps,
        icon: 'calendar-clock',
        severity: pipelineSummary.dueFollowUps > 0 ? 'attention' : 'neutral',
      },
      {
        label: 'Prêtes',
        value: pipelineSummary.preparedNotApplied,
        icon: 'send',
        severity: pipelineSummary.preparedNotApplied > 0 ? 'attention' : 'neutral',
      },
    ];

    if (pipelineSummary.dueFollowUps > 0) {
      return {
        severity: 'attention' as const,
        statusLabel: 'Relance à faire',
        title: `${pipelineSummary.dueFollowUps} relance${pipelineSummary.dueFollowUps > 1 ? 's' : ''} à traiter maintenant`,
        description:
          'La prochaine décision n’est pas de parcourir toutes les missions, mais de reprendre les dossiers qui ont une échéance.',
        evidence,
        primaryActionLabel: 'Voir la relance',
        primaryActionIcon: 'calendar-clock',
      };
    }

    if (pipelineSummary.preparedNotApplied > 0) {
      return {
        severity: 'attention' as const,
        statusLabel: 'Prêt à envoyer',
        title: `${pipelineSummary.preparedNotApplied} candidature${pipelineSummary.preparedNotApplied > 1 ? 's' : ''} préparée${pipelineSummary.preparedNotApplied > 1 ? 's' : ''} mais pas encore envoyée${pipelineSummary.preparedNotApplied > 1 ? 's' : ''}`,
        description:
          'Le contenu existe déjà. La prochaine action utile est de finaliser l’envoi ou de changer le statut.',
        evidence,
        primaryActionLabel: 'Continuer le dossier',
        primaryActionIcon: 'arrow-right',
      };
    }

    if (pipelineSummary.activeCount === 0) {
      return {
        severity: 'neutral' as const,
        statusLabel: 'Aucun suivi',
        title: 'Aucune candidature active pour le moment',
        description:
          'Qualifiez une mission depuis le Feed pour transformer la veille en pipeline actionnable.',
        evidence,
        primaryActionLabel: 'Préparer une mission',
        primaryActionIcon: 'briefcase',
      };
    }

    return {
      severity: 'success' as const,
      statusLabel: 'Pipeline sain',
      title: `${pipelineSummary.activeCount} dossier${pipelineSummary.activeCount > 1 ? 's' : ''} actif${pipelineSummary.activeCount > 1 ? 's' : ''}, aucune relance en retard`,
      description:
        pipelineSummary.bottleneck !== null
          ? `Le goulot actuel est ${pipelineSummary.bottleneck.label}. Concentrez les prochaines actions sur cette étape.`
          : 'Le pipeline est sous contrôle. Continuez par le dossier sélectionné ou préparez une nouvelle candidature.',
      evidence,
      primaryActionLabel: 'Ouvrir le dossier',
      primaryActionIcon: 'arrow-right',
    };
  });

  function getLastActivity(record: MissionTracking | null): number {
    if (!record || record.history.length === 0) {
      return 0;
    }
    return record.history[record.history.length - 1].timestamp;
  }

  function getNextActionTimestamp(record: MissionTracking): number {
    if (!record.nextActionAt) {
      return Number.POSITIVE_INFINITY;
    }

    const timestamp = Date.parse(record.nextActionAt);
    return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
  }

  function getMissionScore(mission: Mission): number {
    return mission.scoreBreakdown?.total ?? mission.score ?? 0;
  }

  function formatMissionMeta(mission: Mission): string {
    return [mission.client, mission.location, mission.tjm ? `${mission.tjm} €/j` : null]
      .filter(Boolean)
      .join(' · ');
  }

  function formatDate(timestamp: number): string {
    if (!timestamp) {
      return 'Jamais';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function formatNextAction(nextActionAt: string | null | undefined): string | null {
    if (!nextActionAt) {
      return null;
    }

    const timestamp = Date.parse(nextActionAt);
    if (!Number.isFinite(timestamp)) {
      return null;
    }

    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function isoToDateTimeLocal(value: string | null): string {
    if (!value) {
      return '';
    }

    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      return '';
    }

    const date = new Date(timestamp);
    const offsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(timestamp - offsetMs).toISOString().slice(0, 16);
  }

  function dateTimeLocalToIso(value: string): string | null {
    if (!value) {
      return null;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }

  async function loadAssets(missionId: string): Promise<void> {
    try {
      const response = await sendMessage({
        type: 'GET_GENERATED_ASSETS',
        payload: { missionId },
      });
      assets = response.type === 'GENERATED_ASSETS_RESULT' ? response.payload : [];
    } catch {
      assets = [];
    }
  }

  async function selectMission(missionId: string): Promise<void> {
    selectedMissionId = missionId;
    await loadAssets(missionId);
  }

  function handleApplicationStoryAction(): void {
    if (recommendedTrackedMission) {
      void selectMission(recommendedTrackedMission.mission.id);
      return;
    }

    onNavigateToFeed?.();
  }

  function openRecommendedDossier(): void {
    if (!recommendedTrackedMission) {
      onNavigateToFeed?.();
      return;
    }

    void selectMission(recommendedTrackedMission.mission.id);
  }

  function getRecommendedDossierReason(item: TrackedMission): string {
    if (isDueFollowUp(item.record, Date.now())) {
      return 'Relance échue: reprenez ce dossier avant de parcourir le reste du pipeline.';
    }

    if (item.record.currentStatus === 'application_prepared') {
      return 'Kit prêt: finalisez l’envoi ou changez le statut pour garder le pipeline propre.';
    }

    return 'Dossier actif: continuez par la dernière mission suivie avant de créer un nouveau dossier.';
  }

  async function transitionTo(status: ApplicationStatus): Promise<void> {
    if (!selectedMission) {
      return;
    }
    const missionId = selectedMission.id;
    const previousTracking = selectedTracking
      ? {
          ...selectedTracking,
          history: [...selectedTracking.history],
          generatedAssetIds: [...selectedTracking.generatedAssetIds],
        }
      : null;
    await tracking.transitionStatus(missionId, status);
    showToastAction(`Statut: ${STATUS_LABELS[status]}`, 'success', {
      label: 'Annuler',
      onClick: () => {
        void tracking.restoreTracking(missionId, previousTracking);
      },
    });
  }

  function formatDecisionTransition(transition: StatusTransition): string {
    if (transition.from === null) {
      return `Entrée dans le pipeline: ${STATUS_LABELS[transition.to]}`;
    }

    return `${STATUS_LABELS[transition.from]} vers ${STATUS_LABELS[transition.to]}`;
  }

  function formatDecisionNote(note: string | null): string | null {
    const trimmed = note?.trim();
    return trimmed ? trimmed : null;
  }

  async function saveNextAction(): Promise<void> {
    if (!selectedMission) {
      return;
    }

    const errorBefore = tracking.error;
    await tracking.updateNextActionAt(selectedMission.id, dateTimeLocalToIso(nextActionInput));
    if (tracking.error && tracking.error !== errorBefore) {
      await showToast(tracking.error, 'error');
      return;
    }
    await showToast('Prochaine action mise à jour', 'success');
  }

  async function clearNextAction(): Promise<void> {
    if (!selectedMission) {
      return;
    }

    nextActionInput = '';
    const errorBefore = tracking.error;
    await tracking.updateNextActionAt(selectedMission.id, null);
    if (tracking.error && tracking.error !== errorBefore) {
      await showToast(tracking.error, 'error');
      return;
    }
    await showToast('Prochaine action effacée', 'success');
  }

  async function generate(type: GenerationType): Promise<void> {
    if (!selectedMission || generatingType !== null) {
      return;
    }

    generatingType = type;
    try {
      const response = await sendMessage({
        type: 'GENERATE_ASSET',
        payload: { missionId: selectedMission.id, generationType: type },
      });

      if (response.type !== 'GENERATION_RESULT' || !response.payload.asset) {
        const error = response.type === 'GENERATION_RESULT' ? response.payload.error : null;
        if (error === 'PREMIUM_REQUIRED') {
          await showToast('La génération de kits est réservée à MissionPulse Premium', 'error');
        } else if (error === 'INSUFFICIENT_CREDITS') {
          await showToast('Crédits insuffisants pour générer ce contenu', 'error');
        } else {
          await showToast('Génération indisponible pour cette mission', 'error');
        }
        return;
      }

      assets = [
        response.payload.asset,
        ...assets.filter((asset) => asset.id !== response.payload.asset?.id),
      ];
      await tracking.loadTrackings();
      await showToast('Contenu généré', 'success');
    } finally {
      generatingType = null;
    }
  }

  async function copyAsset(content: string): Promise<void> {
    await navigator.clipboard.writeText(content);
    await showToast('Copié', 'success');
  }

  async function loadApplications(): Promise<void> {
    isLoading = true;
    loadError = null;
    await tracking.loadTrackings();
    missions = await getMissions();
    selectedMissionId = missions[0]?.id ?? null;
    if (selectedMissionId) {
      await loadAssets(selectedMissionId);
    }
    isLoading = false;
  }

  loadApplications().catch(async () => {
    isLoading = false;
    loadError = 'Impossible de charger les candidatures';
    await showToast('Impossible de charger les candidatures', 'error');
  });
</script>

<div class="flex h-full flex-col overflow-y-auto px-4 pb-5 pt-4">
  <AvailabilityPanel store={availabilityStore} platforms={availabilityPlatforms} />

  <section class="section-card-strong rounded-2xl px-5 py-4">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="eyebrow text-blueprint-blue">Pipeline</p>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold text-text-primary">Candidatures</h2>
          <span
            class="rounded-md border border-border-light bg-page-canvas px-2 py-1 text-[10px] font-medium text-text-subtle"
          >
            Local uniquement
          </span>
        </div>
        <p class="mt-1 text-xs leading-5 text-text-subtle">
          Suivre les missions qualifiées, préparer les messages et faire avancer chaque dossier.
        </p>
        <p class="mt-2 text-[11px] leading-5 text-text-muted">
          Ces statuts restent dans l'extension tant que le compte MissionPulse n'est pas connecté.
        </p>
      </div>
      <div
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blueprint-blue/15 bg-blueprint-blue/6"
      >
        <Icon name="mail" size={18} class="text-blueprint-blue" />
      </div>
    </div>
    <div class="mt-4">
      <OperationalStoryCard
        eyebrow="Priorité"
        variant="compact"
        title={applicationStory.title}
        description={applicationStory.description}
        severity={applicationStory.severity}
        statusLabel={applicationStory.statusLabel}
        evidence={applicationStory.evidence}
        primaryActionLabel={applicationStory.primaryActionLabel}
        primaryActionIcon={applicationStory.primaryActionIcon}
        onPrimaryAction={handleApplicationStoryAction}
      />
    </div>
    {#if isOffline}
      <div class="mt-3">
        <OfflineNotice
          description="Le pipeline local reste modifiable. Les ouvertures de mission et générations de messages peuvent attendre le retour réseau."
          action="Prochaine action : mettre à jour les relances dues et préparer les prochaines actions."
        />
      </div>
    {/if}

    {#if !isLoading}
      <section
        class="mt-3 rounded-xl border border-blueprint-blue/15 bg-surface-white p-3"
        aria-label="Dossier recommandé"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-blueprint-blue">
              Dossier recommandé
            </p>
            {#if recommendedTrackedMission}
              <h3 class="mt-1 truncate text-sm font-semibold text-text-primary">
                {recommendedTrackedMission.mission.title}
              </h3>
              <p class="mt-1 text-xs leading-5 text-text-subtle">
                {getRecommendedDossierReason(recommendedTrackedMission)}
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span
                  class="rounded-md bg-blueprint-blue/8 px-2 py-0.5 text-[10px] font-medium text-blueprint-blue"
                >
                  {STATUS_LABELS[recommendedTrackedMission.record.currentStatus]}
                </span>
                {#if formatNextAction(recommendedTrackedMission.record.nextActionAt)}
                  <span class="text-[10px] text-text-muted">
                    Action {formatNextAction(recommendedTrackedMission.record.nextActionAt)}
                  </span>
                {/if}
              </div>
            {:else}
              <h3 class="mt-1 text-sm font-semibold text-text-primary">
                Aucun dossier suivi pour l’instant
              </h3>
              <p class="mt-1 text-xs leading-5 text-text-subtle">
                Qualifiez une mission depuis le Feed pour transformer la veille en candidature.
              </p>
            {/if}
          </div>
          <button
            type="button"
            class="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blueprint-blue/90"
            onclick={openRecommendedDossier}
          >
            <Icon name={recommendedTrackedMission ? 'arrow-right' : 'briefcase'} size={13} />
            {recommendedTrackedMission ? 'Ouvrir le dossier' : 'Aller au feed'}
          </button>
        </div>
      </section>
    {/if}
    <ApplicationPipelineSummary summary={pipelineSummary} />
  </section>

  {#if isLoading}
    <div class="mt-4 section-card rounded-xl p-5" aria-busy="true" role="status" aria-live="polite">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
            Chargement candidatures
          </p>
          <h3 class="mt-1 text-sm font-semibold text-text-primary">
            Reconstruction du pipeline local
          </h3>
          <p class="mt-1 text-xs leading-5 text-text-subtle">
            Pulse relie les missions, statuts et contenus générés avant de recommander le prochain
            dossier.
          </p>
        </div>
        <Icon name="loader" size={16} class="mt-1 shrink-0 animate-spin text-blueprint-blue" />
      </div>

      <div
        class="mt-4 grid gap-2 md:grid-cols-3"
        aria-label="Progression du chargement candidatures"
      >
        {#each loadingProgressSteps as step, i (i)}
          <div class="rounded-lg border border-border-light bg-page-canvas p-3">
            <div
              class="flex h-7 w-7 items-center justify-center rounded-md bg-blueprint-blue/8 text-blueprint-blue"
            >
              <Icon name={step.icon} size={13} />
            </div>
            <p class="mt-2 text-xs font-medium text-text-primary">{step.label}</p>
            <p class="mt-1 text-[11px] leading-5 text-text-subtle">{step.detail}</p>
          </div>
        {/each}
      </div>

      <div class="mt-4 space-y-3">
        <div class="h-3 w-28 rounded-full bg-subtle-gray"></div>
        <div class="h-20 rounded-xl bg-subtle-gray/70"></div>
        <div class="h-20 rounded-xl bg-subtle-gray/70"></div>
      </div>
    </div>
  {:else if loadError}
    <div class="mt-4">
      <OperationalEmptyState
        title="Le pipeline candidatures ne peut pas être chargé"
        description="Les statuts locaux sont indisponibles pour le moment. Réessayez avant de modifier un dossier ou de générer un kit."
        severity="critical"
        statusLabel="Incident"
        icon="triangle-alert"
        proofLabel="Pipeline"
        proofValue="Indisponible"
        primaryActionLabel="Réessayer"
        primaryActionIcon="refresh-cw"
        onPrimaryAction={() => {
          loadApplications().catch(() => {});
        }}
      />
    </div>
  {:else if missions.length === 0}
    <div class="mt-4">
      <OperationalEmptyState
        title="Aucune mission ne peut encore devenir candidature"
        description="Le pipeline démarre quand une mission existe dans le feed. Lancez ou consultez le radar, puis revenez préparer un dossier."
        severity="attention"
        statusLabel="Pipeline vide"
        icon="briefcase"
        proofLabel="Missions disponibles"
        proofValue="0"
        primaryActionLabel="Retourner au feed"
        primaryActionIcon="arrow-left"
        onPrimaryAction={() => onNavigateToFeed?.()}
      />
    </div>
  {:else}
    <div class="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <section class="section-card rounded-xl p-3">
        <div class="flex items-center justify-between px-2 pb-2">
          <h3 class="text-sm font-medium text-text-primary">Missions</h3>
          <span class="text-xs text-text-muted">{trackedMissions.length} suivies</span>
        </div>
        <div class="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
          {#each trackedMissions.length > 0 ? trackedMissions : missions
                .slice(0, 20)
                .map( (mission) => ({ mission, record: tracking.getTrackingForMission(mission.id) ?? null }) ) as item (item.mission.id)}
            <button
              class="w-full rounded-lg border px-3 py-3 text-left transition-colors {selectedMissionId ===
              item.mission.id
                ? 'border-blueprint-blue/30 bg-blueprint-blue/6'
                : 'border-border-light bg-page-canvas hover:bg-subtle-gray'}"
              onclick={() => selectMission(item.mission.id)}
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-text-primary">{item.mission.title}</p>
                  <p class="mt-1 truncate text-xs text-text-subtle">
                    {formatMissionMeta(item.mission)}
                  </p>
                </div>
                <span class="shrink-0 text-xs font-semibold text-blueprint-blue">
                  {getMissionScore(item.mission)}
                </span>
              </div>
              <div class="mt-2 flex items-center justify-between gap-2">
                <span
                  class="rounded-md bg-surface-white px-2 py-0.5 text-[10px] font-medium text-text-subtle"
                >
                  {STATUS_LABELS[item.record?.currentStatus ?? 'detected']}
                </span>
                <span class="text-[10px] text-text-muted">
                  {formatNextAction(item.record?.nextActionAt) ??
                    formatDate(getLastActivity(item.record))}
                </span>
              </div>
            </button>
          {/each}
        </div>
      </section>

      <section class="space-y-4">
        {#if selectedMission}
          <div class="section-card rounded-xl p-5">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <p class="text-[10px] font-medium uppercase tracking-[0.15em] text-blueprint-blue">
                  {STATUS_LABELS[selectedStatus]}
                </p>
                <h3 class="mt-1 text-base font-semibold text-text-primary">
                  {selectedMission.title}
                </h3>
                <p class="mt-1 text-xs leading-5 text-text-subtle">
                  {formatMissionMeta(selectedMission)}
                </p>
                {#if formatNextAction(selectedTracking?.nextActionAt)}
                  <p
                    class="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/6 px-2 py-1 text-[11px] font-medium text-blueprint-blue"
                  >
                    <Icon name="calendar-clock" size={12} />
                    Prochaine action {formatNextAction(selectedTracking?.nextActionAt)}
                  </p>
                {/if}
              </div>
              <a
                href={selectedMission.url}
                target="_blank"
                rel="noreferrer"
                class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-muted hover:bg-subtle-gray hover:text-text-primary"
                title="Ouvrir la mission"
              >
                <Icon name="external-link" size={14} />
              </a>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              {#each nextStatuses as status, i (i)}
                <button
                  class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray"
                  onclick={() => transitionTo(status)}
                >
                  <Icon name="arrow-right" size={12} />
                  {STATUS_LABELS[status]}
                </button>
              {/each}
            </div>

            <div class="mt-4 rounded-lg border border-border-light bg-page-canvas p-3">
              <label
                for="application-next-action"
                class="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted"
              >
                Prochaine action
              </label>
              <div class="mt-2 flex flex-wrap gap-2">
                <input
                  id="application-next-action"
                  type="datetime-local"
                  class="min-w-0 flex-1 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs text-text-primary outline-none transition-colors focus:border-blueprint-blue/30"
                  bind:value={nextActionInput}
                  aria-label="Prochaine action"
                />
                <button
                  class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray"
                  onclick={saveNextAction}
                >
                  <Icon name="save" size={12} />
                  Enregistrer
                </button>
                {#if selectedTracking?.nextActionAt}
                  <button
                    class="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-subtle transition-colors hover:bg-subtle-gray hover:text-text-primary"
                    onclick={clearNextAction}
                  >
                    <Icon name="x" size={12} />
                    Effacer
                  </button>
                {/if}
              </div>
            </div>

            {#if selectedDecisionHistory.length > 0}
              <div
                class="mt-4 rounded-lg border border-border-light bg-page-canvas p-3"
                aria-label="Historique des décisions"
              >
                <div class="flex items-center justify-between gap-3">
                  <p class="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                    Historique des décisions
                  </p>
                  <span class="text-[10px] text-text-muted">
                    {selectedTracking?.history.length ?? 0} événement{(selectedTracking?.history
                      .length ?? 0) > 1
                      ? 's'
                      : ''}
                  </span>
                </div>
                <ol class="mt-3 space-y-2">
                  {#each selectedDecisionHistory as transition, i (i)}
                    <li
                      class="flex gap-3 rounded-lg border border-border-light bg-surface-white p-2.5"
                    >
                      <span
                        class="mt-1 h-2 w-2 shrink-0 rounded-full bg-blueprint-blue"
                        aria-hidden="true"
                      ></span>
                      <div class="min-w-0">
                        <p class="text-xs font-medium text-text-primary">
                          {formatDecisionTransition(transition)}
                        </p>
                        <p class="mt-0.5 text-[11px] text-text-muted">
                          {formatDate(transition.timestamp)}
                        </p>
                        {#if formatDecisionNote(transition.note)}
                          <p class="mt-1 text-[11px] leading-4 text-text-subtle">
                            Note : {formatDecisionNote(transition.note)}
                          </p>
                        {/if}
                      </div>
                    </li>
                  {/each}
                </ol>
              </div>
            {/if}
          </div>

          <div class="section-card rounded-xl p-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-sm font-medium text-text-primary">Kit de candidature</h3>
                <p class="mt-1 text-xs text-text-subtle">Pitch, message recruteur et résumé CV.</p>
              </div>
            </div>
            <div class="mt-4 grid gap-2">
              {#each generationTypes as type, i (i)}
                <button
                  class="inline-flex items-center justify-center gap-2 rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-subtle-gray disabled:opacity-50"
                  onclick={() => generate(type)}
                  disabled={generatingType !== null}
                >
                  <Icon name={GENERATION_TYPE_ICONS[type]} size={14} class="text-blueprint-blue" />
                  {generatingType === type ? 'Génération...' : GENERATION_TYPE_LABELS[type]}
                </button>
              {/each}
            </div>
          </div>

          {#if assets.length === 0}
            <OperationalEmptyState
              title="Aucun kit n’est prêt pour cette mission"
              description="La prochaine action utile est de générer un pitch court ou un message recruteur, puis de passer le dossier au statut préparé."
              severity="attention"
              statusLabel="À préparer"
              icon="file-plus"
              proofLabel="Contenus générés"
              proofValue="0"
              primaryActionLabel="Générer un pitch"
              primaryActionIcon={GENERATION_TYPE_ICONS.pitch}
              secondaryActionLabel="Générer le message"
              secondaryActionIcon={GENERATION_TYPE_ICONS['cover-message']}
              onPrimaryAction={() => generate('pitch')}
              onSecondaryAction={() => generate('cover-message')}
            />
          {/if}

          {#each assets as asset (asset.id)}
            <article class="section-card rounded-xl p-5">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <Icon
                    name={GENERATION_TYPE_ICONS[asset.type]}
                    size={14}
                    class="text-blueprint-blue"
                  />
                  <h4 class="text-sm font-medium text-text-primary">
                    {GENERATION_TYPE_LABELS[asset.type]}
                  </h4>
                </div>
                <button
                  class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light bg-surface-white text-text-muted hover:bg-subtle-gray hover:text-text-primary"
                  onclick={() => copyAsset(asset.content)}
                  title="Copier"
                >
                  <Icon name="check" size={13} />
                </button>
              </div>
              <p class="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                {asset.content}
              </p>
            </article>
          {/each}
        {/if}
      </section>
    </div>
  {/if}
</div>
