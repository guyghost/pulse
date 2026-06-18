<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { Mission } from '$lib/core/types/mission';
  import type { GeneratedAsset, GenerationType } from '$lib/core/types/generation';
  import { GENERATION_TYPE_ICONS, GENERATION_TYPE_LABELS } from '$lib/core/types/generation';
  import type { ApplicationStatus, MissionTracking } from '$lib/core/types/tracking';
  import { STATUS_LABELS, VALID_TRANSITIONS } from '$lib/core/types/tracking';
  import { getMissions } from '$lib/shell/facades/feed-data.facade';
  import { createTrackingStore } from '$lib/state/tracking.svelte';
  import { sendMessage } from '$lib/shell/messaging/bridge';
  import { showToast } from '$lib/shell/notifications/toast-service';
  import { summarizeApplicationPipeline } from '$lib/core/tracking/pipeline-summary';
  import ApplicationPipelineSummary from '../organisms/ApplicationPipelineSummary.svelte';

  const tracking = createTrackingStore();

  let missions = $state<Mission[]>([]);
  let isLoading = $state(true);
  let selectedMissionId = $state<string | null>(null);
  let assets = $state<GeneratedAsset[]>([]);
  let generatingType = $state<GenerationType | null>(null);
  let nextActionInput = $state('');

  const generationTypes: GenerationType[] = ['pitch', 'cover-message', 'cv-summary'];

  const trackedMissions = $derived.by(() => {
    return missions
      .map((mission) => ({
        mission,
        record: tracking.getTrackingForMission(mission.id) ?? null,
      }))
      .filter(({ record }) => record && record.currentStatus !== 'detected')
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

  $effect(() => {
    nextActionInput = isoToDateTimeLocal(selectedTracking?.nextActionAt ?? null);
  });

  const pipelineSummary = $derived.by(() =>
    summarizeApplicationPipeline([...tracking.trackings.values()], Date.now())
  );

  function getLastActivity(record: MissionTracking | null): number {
    if (!record || record.history.length === 0) {
      return 0;
    }
    return record.history[record.history.length - 1].timestamp;
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

  async function transitionTo(status: ApplicationStatus): Promise<void> {
    if (!selectedMission) {
      return;
    }
    await tracking.transitionStatus(selectedMission.id, status);
    await showToast(`Statut: ${STATUS_LABELS[status]}`, 'success');
  }

  async function saveNextAction(): Promise<void> {
    if (!selectedMission) {
      return;
    }

    await tracking.updateNextActionAt(selectedMission.id, dateTimeLocalToIso(nextActionInput));
    await showToast('Prochaine action mise à jour', 'success');
  }

  async function clearNextAction(): Promise<void> {
    if (!selectedMission) {
      return;
    }

    nextActionInput = '';
    await tracking.updateNextActionAt(selectedMission.id, null);
    await showToast('Prochaine action effacée', 'success');
  }

  async function generate(type: GenerationType): Promise<void> {
    if (!selectedMission) {
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
        await showToast(
          error === 'INSUFFICIENT_CREDITS'
            ? 'Crédits insuffisants pour générer ce contenu'
            : 'Génération indisponible pour cette mission',
          'error'
        );
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

  (async () => {
    isLoading = true;
    await tracking.loadTrackings();
    missions = await getMissions();
    selectedMissionId = missions[0]?.id ?? null;
    if (selectedMissionId) {
      await loadAssets(selectedMissionId);
    }
    isLoading = false;
  })().catch(async () => {
    isLoading = false;
    await showToast('Impossible de charger les candidatures', 'error');
  });
</script>

<div class="flex h-full flex-col overflow-y-auto px-4 pb-5 pt-4">
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
    <ApplicationPipelineSummary summary={pipelineSummary} />
  </section>

  {#if isLoading}
    <div class="mt-4 section-card rounded-xl p-5 text-sm text-text-subtle">Chargement...</div>
  {:else if missions.length === 0}
    <div class="mt-4 section-card rounded-xl p-5 text-sm text-text-subtle">
      Aucune mission disponible. Lancez un scan depuis le feed.
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
                .map( (mission) => ({ mission, record: tracking.getTrackingForMission(mission.id) ?? null }) ) as item}
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
              {#each nextStatuses as status}
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
          </div>

          <div class="section-card rounded-xl p-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-sm font-medium text-text-primary">Kit de candidature</h3>
                <p class="mt-1 text-xs text-text-subtle">Pitch, message recruteur et résumé CV.</p>
              </div>
            </div>
            <div class="mt-4 grid gap-2">
              {#each generationTypes as type}
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

          {#each assets as asset}
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
