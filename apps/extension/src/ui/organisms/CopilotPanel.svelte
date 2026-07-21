<script lang="ts">
  import {
    copilotTjmFactIds,
    isCopilotSourceRefGrounded,
    isReviewableCopilotResult,
    renderCopilotDraft,
    type CopilotMissionField,
    type CopilotOperationKind,
    type CopilotProfileField,
    type CopilotSourceRef,
    type CopilotTjmFactId,
  } from '@pulse/domain';
  import { Icon, type IconName } from '@pulse/ui';
  import { untrack } from 'svelte';

  import type { CopilotJobStatus } from '$lib/shell/copilot/contracts';
  import { createCopilotStore, type CopilotStore } from '$lib/state/copilot.svelte';

  const {
    missionId,
    onCopy,
    store = createCopilotStore(),
  }: {
    missionId: string;
    onCopy: (content: string) => void | Promise<void>;
    store?: CopilotStore;
  } = $props();

  const missionLabels: Record<CopilotMissionField, string> = {
    title: 'Titre',
    description: 'Description',
    client: 'Client',
    stack: 'Stack',
    location: 'Localisation',
    remoteMode: 'Mode remote',
    duration: 'Durée',
    startDate: 'Date de début',
    displayedTjm: 'TJM affiché',
  };
  const profileLabels: Record<CopilotProfileField, string> = {
    jobTitle: 'Métier',
    seniority: 'Séniorité',
    location: 'Localisation',
    keywords: 'Mots-clés',
    stack: 'Stack du profil',
    tjmBounds: 'Fourchette TJM',
  };
  const tjmFactLabels: Record<CopilotTjmFactId, string> = {
    'mission-displayed-tjm': 'TJM affiché de la mission',
    'profile-tjm-bounds': 'Fourchette TJM du profil',
    'market-matched-stacks': 'Stacks rapprochées du marché local',
    'market-sample': 'Volume agrégé du marché local',
    'market-range': 'Fourchette agrégée du marché local',
    'market-trend': 'Tendance agrégée du marché local',
    'market-last-observed': 'Date du dernier relevé agrégé',
  };
  const operations: Array<{
    kind: CopilotOperationKind;
    label: string;
    detail: string;
    icon: IconName;
  }> = [
    { kind: 'analysis', label: 'Analyser la mission', detail: 'Inclus', icon: 'sparkles' },
    { kind: 'pitch', label: 'Préparer un pitch', detail: '1 crédit', icon: 'message-square' },
    {
      kind: 'cover-message',
      label: 'Écrire le message',
      detail: '1 crédit',
      icon: 'mail',
    },
    { kind: 'cv-summary', label: 'Adapter le résumé CV', detail: '1 crédit', icon: 'file-text' },
    { kind: 'tjm-coach', label: 'Coach TJM', detail: '1 crédit', icon: 'badge-euro' },
  ];
  const artifactLabels: Record<Exclude<CopilotOperationKind, 'analysis'>, string> = {
    pitch: 'Pitch',
    'cover-message': 'Message recruteur',
    'cv-summary': 'Résumé CV',
    'tjm-coach': 'Argumentaire TJM',
  };
  const pollingStatuses = new Set<CopilotJobStatus>([
    'checkpointed',
    'queued',
    'running',
    'cancelling',
  ]);

  let deleteConfirmation = $state(false);
  const hasSelection = $derived(
    store.missionFields.length + store.profileFields.length + store.selectedEvidenceIds.length > 0
  );
  const jobBlocksCreation = $derived(
    store.job !== null &&
      (pollingStatuses.has(store.job.status) ||
        store.job.status === 'uncertain' ||
        store.job.status === 'review')
  );
  const reviewableResult = $derived(
    store.job?.result &&
      isReviewableCopilotResult(
        store.job.result,
        store.job.kind,
        store.job.selection.evidenceIds,
        copilotTjmFactIds(store.job.tjmFacts),
        {
          payload: store.job.sourceSnapshot.payload,
          tjmFacts: store.job.tjmFacts,
        }
      )
      ? store.job.result
      : null
  );
  const supportedEvidenceClaims = $derived(
    reviewableResult?.evidenceClaims.filter(
      (claim) =>
        claim.evidenceIds.length > 0 && claim.evidenceIds.every((id) => jobEvidence(id) !== null)
    ) ?? []
  );
  const groundedDraftSegments = $derived(
    reviewableResult?.draftSegments?.filter((segment) =>
      segment.sourceRefs.every(sourceRefGrounded)
    ) ?? []
  );
  const hasCompleteGroundedDraft = $derived(
    reviewableResult?.kind === 'analysis' ||
      (reviewableResult?.draftSegments !== undefined &&
        reviewableResult.draftSegments.length > 0 &&
        groundedDraftSegments.length === reviewableResult.draftSegments.length)
  );
  const groundedDraftText = $derived(
    reviewableResult && reviewableResult.kind !== 'analysis' && hasCompleteGroundedDraft
      ? renderCopilotDraft(reviewableResult)
      : null
  );

  $effect(() => {
    const currentMissionId = missionId;
    deleteConfirmation = false;
    untrack(() => void store.open(currentMissionId));
    return () => untrack(() => store.close(currentMissionId));
  });

  function checked(event: Event): boolean {
    return (event.currentTarget as HTMLInputElement).checked;
  }

  function statusLabel(status: CopilotJobStatus): string {
    const labels: Record<CopilotJobStatus, string> = {
      checkpointed: 'Reprise sécurisée en attente',
      queued: 'Dans la file Eve',
      running: 'Préparation en cours',
      uncertain: 'Réconciliation opérateur requise',
      review: 'Prêt à relire',
      accepted: 'Conservé',
      rejected: 'Écarté',
      cancelling: 'Annulation en cours',
      cancelled: 'Annulé',
      failed: 'Échec',
    };
    return labels[status];
  }

  function formatEur(value: number | null): string {
    return value === null ? 'Non disponible' : `${value.toLocaleString('fr-FR')} €/j`;
  }

  function evidenceLabel(evidenceId: string): string {
    const evidence = jobEvidence(evidenceId);
    const label = evidence
      ? [evidence.role, evidence.company].filter(Boolean).join(' · ')
      : evidenceId;
    return `${label} [${evidenceId}]`;
  }

  function evidenceExcerpt(evidenceId: string): string {
    return jobEvidence(evidenceId)?.summary ?? 'Extrait du job indisponible.';
  }

  function jobEvidence(evidenceId: string) {
    return (
      store.job?.sourceSnapshot.payload.experienceEvidence.find(
        (evidence) => evidence.evidenceId === evidenceId
      ) ?? null
    );
  }

  function sourceRefGrounded(sourceRef: CopilotSourceRef): boolean {
    if (!store.job) {
      return false;
    }
    return isCopilotSourceRefGrounded(
      sourceRef,
      { payload: store.job.sourceSnapshot.payload, tjmFacts: store.job.tjmFacts },
      store.job.selection.evidenceIds,
      copilotTjmFactIds(store.job.tjmFacts)
    );
  }

  function sourceRefLabel(sourceRef: CopilotSourceRef): string {
    switch (sourceRef.kind) {
      case 'experience':
        return evidenceLabel(sourceRef.id);
      case 'mission-field':
        return `${missionLabels[sourceRef.id]} [mission:${sourceRef.id}]`;
      case 'profile-field':
        return `${profileLabels[sourceRef.id]} [profil:${sourceRef.id}]`;
      case 'tjm-fact':
        return `${tjmFactLabels[sourceRef.id]} [${sourceRef.id}]`;
    }
  }

  function sourceRefExcerpt(sourceRef: CopilotSourceRef): string {
    return sourceRef.quote;
  }

  function canCreateOperation(kind: CopilotOperationKind): boolean {
    if (
      store.accessState !== 'active' ||
      !store.rolloutEnabled ||
      !store.consentConfirmed ||
      !hasSelection ||
      store.action !== null ||
      jobBlocksCreation
    ) {
      return false;
    }
    if (kind === 'pitch' || kind === 'cover-message' || kind === 'cv-summary') {
      return store.selectedEvidenceIds.length > 0;
    }
    if (kind === 'tjm-coach') {
      return (
        store.missionFields.includes('stack') &&
        store.missionFields.includes('displayedTjm') &&
        store.profileFields.includes('keywords') &&
        store.profileFields.includes('tjmBounds')
      );
    }
    return true;
  }

  function deletionReceiptMessage(): string | null {
    switch (store.deletionReceipt?.disposition) {
      case 'deleted':
        return 'MissionPulse confirme la suppression du dossier Copilot distant.';
      case 'not-created':
        return 'MissionPulse confirme qu’aucun dossier Copilot distant n’avait été créé.';
      case 'retention-confirmed':
        return 'Eve confirme une conservation selon sa politique de rétention. La durée n’est pas communiquée : ceci ne confirme pas une suppression complète.';
      default:
        return null;
    }
  }

  function deletionReceiptDate(): string | null {
    return store.deletionReceipt
      ? new Date(store.deletionReceipt.confirmedAtMs).toLocaleString('fr-FR')
      : null;
  }

  function approvedAt(value: number): string {
    return new Date(value).toLocaleString('fr-FR');
  }
</script>

<section class="section-card rounded-xl p-5" aria-labelledby="copilot-title">
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <h3 id="copilot-title" class="text-sm font-medium text-text-primary">Copilot Premium</h3>
        <span
          class="rounded-md border border-blueprint-blue/20 bg-blueprint-blue/6 px-2 py-0.5 text-[10px] font-medium text-blueprint-blue"
        >
          Eve · distant
        </span>
      </div>
      <p class="mt-1 text-xs leading-5 text-text-subtle">
        Analyse contextualisée Premium et contenus à relire. Le Copilot ne change jamais le statut
        de la candidature.
      </p>
    </div>
    <Icon name="shield-check" size={17} class="shrink-0 text-blueprint-blue" />
  </div>

  {#if deletionReceiptMessage()}
    <div class="mt-4 rounded-lg border border-border-light bg-page-canvas p-3" role="status">
      <p class="text-xs font-medium text-text-primary">Issue de la demande de suppression</p>
      <p class="mt-1 text-[11px] leading-5 text-text-subtle">{deletionReceiptMessage()}</p>
      <p class="mt-1 text-[10px] text-text-muted">Confirmé le {deletionReceiptDate()}.</p>
    </div>
  {/if}

  {#if store.dossier}
    <section
      class="mt-4 rounded-lg border border-blueprint-blue/15 bg-blueprint-blue/4 p-3"
      aria-labelledby="living-dossier-title"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p id="living-dossier-title" class="text-xs font-medium text-text-primary">
            Dossier vivant
          </p>
          <p class="mt-1 text-[10px] leading-4 text-text-muted">
            Contenus explicitement conservés · état serveur {store.dossier.state}
          </p>
        </div>
        {#if store.dossier.activeJob}
          <span class="rounded-md bg-surface-white px-2 py-1 text-[10px] text-text-subtle">
            Traitement actif · {store.dossier.activeJob.kind}
          </span>
        {/if}
      </div>

      {#if store.dossier.analysis}
        <article class="mt-3 rounded-lg border border-border-light bg-surface-white p-3">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[11px] font-medium text-text-primary">Analyse approuvée</p>
            <span class="text-[9px] text-text-muted">
              {approvedAt(store.dossier.analysis.approvedAtMs)}
            </span>
          </div>
          {#if store.dossier.analysis.result.evidenceClaims.length > 0}
            <ul class="mt-2 space-y-2">
              {#each store.dossier.analysis.result.evidenceClaims as claim (`${claim.text}:${claim.evidenceIds.join(',')}`)}
                <li class="text-[11px] leading-5 text-text-secondary">
                  {claim.text}
                  <span class="block text-[10px] text-text-muted">
                    Preuves : {claim.evidenceIds.join(' · ')}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
          {#if store.dossier.analysis.result.gaps.length > 0}
            <p class="mt-2 text-[11px] leading-5 text-text-subtle">
              <span class="font-medium text-text-primary">Écarts :</span>
              {store.dossier.analysis.result.gaps.join(' · ')}
            </p>
          {/if}
          {#if store.dossier.analysis.result.risks.length > 0}
            <p class="mt-2 text-[11px] leading-5 text-text-subtle">
              <span class="font-medium text-text-primary">Risques :</span>
              {store.dossier.analysis.result.risks.join(' · ')}
            </p>
          {/if}
          {#if store.dossier.analysis.result.questions.length > 0}
            <p class="mt-2 text-[11px] leading-5 text-text-subtle">
              <span class="font-medium text-text-primary">Questions :</span>
              {store.dossier.analysis.result.questions.join(' · ')}
            </p>
          {/if}
        </article>
      {/if}

      {#if store.dossier.approvedArtifacts.length > 0}
        <div class="mt-3 space-y-2">
          <p class="text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted">
            Brouillons approuvés ({store.dossier.approvedArtifacts.length})
          </p>
          {#each store.dossier.approvedArtifacts as artifact (artifact.artifactId)}
            <article class="rounded-lg border border-border-light bg-surface-white p-3">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[11px] font-medium text-text-primary">
                  {artifactLabels[artifact.kind]}
                </p>
                <span class="text-[9px] text-text-muted">{approvedAt(artifact.approvedAtMs)}</span>
              </div>
              <p class="mt-2 whitespace-pre-wrap text-xs leading-5 text-text-primary">
                {artifact.draft}
              </p>
              <button
                type="button"
                class="mt-2 inline-flex items-center gap-2 text-[11px] font-medium text-blueprint-blue"
                onclick={() => onCopy(artifact.draft)}
              >
                <Icon name="check" size={12} /> Copier le brouillon approuvé
              </button>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if store.accessState === 'loading'}
    <div class="mt-4 flex items-center gap-2 text-xs text-text-subtle" aria-live="polite">
      <Icon name="loader-2" size={14} class="animate-spin" />
      Vérification du compte Premium…
    </div>
  {:else if store.accessState === 'disabled' && !store.job && !store.dossier}
    <div class="mt-4 rounded-lg border border-border-light bg-page-canvas p-3">
      <p class="text-xs font-medium text-text-primary">Déploiement fermé</p>
      <p class="mt-1 text-[11px] leading-5 text-text-subtle">
        Le Copilot reste désactivé dans ce build. Aucun contenu n’est transmis.
      </p>
    </div>
  {:else if store.accessState === 'unlinked'}
    <div class="mt-4 rounded-lg border border-border-light bg-page-canvas p-3">
      <p class="text-xs font-medium text-text-primary">Connectez votre compte MissionPulse</p>
      <p class="mt-1 text-[11px] leading-5 text-text-subtle">
        La session est conservée uniquement jusqu’à la fermeture du navigateur.
      </p>
      <button
        type="button"
        class="mt-3 inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        onclick={() => store.link()}
        disabled={store.action !== null}
      >
        <Icon
          name={store.action === 'linking' ? 'loader-2' : 'external-link'}
          size={13}
          class={store.action === 'linking' ? 'animate-spin' : ''}
        />
        {store.action === 'linking' ? 'Connexion…' : 'Connecter le compte'}
      </button>
    </div>
  {:else if (store.accessState === 'free' || store.accessState === 'expired' || store.accessState === 'revoked') && !store.job && !store.dossier}
    <div class="mt-4 rounded-lg border border-status-orange/20 bg-status-orange/5 p-3">
      <p class="text-xs font-medium text-text-primary">Premium requis</p>
      <p class="mt-1 text-[11px] leading-5 text-text-subtle">
        L’entitlement canonique est « {store.accessState} ». Aucun job ne peut être créé.
      </p>
      <button
        type="button"
        class="mt-2 inline-flex items-center gap-2 text-xs font-medium text-blueprint-blue"
        onclick={() => store.syncEntitlement()}
      >
        <Icon name="refresh-cw" size={12} /> Resynchroniser
      </button>
    </div>
  {:else}
    {#if store.entitlement}
      <div class="mt-4 flex items-center justify-between rounded-lg bg-page-canvas px-3 py-2">
        <span class="text-[11px] text-text-subtle">Entitlement vérifié côté serveur</span>
        <span class="text-xs font-medium text-text-primary">
          {store.entitlement.creditsRemaining} crédit{store.entitlement.creditsRemaining > 1
            ? 's'
            : ''}
        </span>
      </div>
    {/if}

    <details class="mt-4 rounded-lg border border-border-light bg-surface-white" open={!store.job}>
      <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-text-primary">
        Données transmises avec votre accord
      </summary>
      <div class="border-t border-border-light p-3">
        <fieldset>
          <legend class="text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted">
            Mission
          </legend>
          <div class="mt-2 grid grid-cols-2 gap-2">
            {#each store.missionFieldOptions as field (field)}
              <label class="flex items-center gap-2 text-[11px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={store.missionFields.includes(field)}
                  onchange={(event) => store.toggleMissionField(field, checked(event))}
                  class="accent-blueprint-blue"
                />
                {missionLabels[field]}
              </label>
            {/each}
          </div>
        </fieldset>

        <fieldset class="mt-4">
          <legend class="text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted">
            Profil
          </legend>
          <div class="mt-2 grid grid-cols-2 gap-2">
            {#each store.profileFieldOptions as field (field)}
              <label class="flex items-center gap-2 text-[11px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={store.profileFields.includes(field)}
                  onchange={(event) => store.toggleProfileField(field, checked(event))}
                  class="accent-blueprint-blue"
                />
                {profileLabels[field]}
              </label>
            {/each}
          </div>
        </fieldset>

        {#if store.availableEvidence.length > 0}
          <fieldset class="mt-4">
            <legend class="text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted">
              Expériences comme sources
            </legend>
            <div class="mt-2 space-y-2">
              {#each store.availableEvidence as evidence (evidence.id)}
                <label class="flex items-start gap-2 text-[11px] text-text-secondary">
                  <input
                    type="checkbox"
                    checked={store.selectedEvidenceIds.includes(evidence.id)}
                    onchange={(event) => store.toggleEvidence(evidence.id, checked(event))}
                    class="mt-0.5 accent-blueprint-blue"
                  />
                  {evidence.label}
                </label>
              {/each}
            </div>
          </fieldset>
        {/if}

        <label
          class="mt-4 flex items-start gap-2 rounded-lg bg-page-canvas p-3 text-[11px] leading-5 text-text-secondary"
        >
          <input
            type="checkbox"
            checked={store.consentConfirmed}
            disabled={!hasSelection}
            onchange={(event) => store.setConsentConfirmed(checked(event))}
            class="mt-0.5 accent-blueprint-blue"
          />
          Je consens à transmettre uniquement les champs cochés à MissionPulse Copilot pour ce job.
        </label>
        <p class="mt-2 text-[10px] leading-4 text-text-muted">
          Coach TJM transmet aussi des repères de marché numériques agrégés : stacks rapprochées,
          volumes, fourchette, tendance et date. Aucun relevé de mission individuel n’est transmis.
        </p>
        <p class="mt-1 text-[10px] leading-4 text-text-muted">
          Pitch, message et résumé CV exigent au moins une expérience cochée afin que chaque segment
          généré cite sa source.
        </p>
        <p class="mt-1 text-[10px] leading-4 text-text-muted">
          Décocher limite le job courant. Les données déjà consenties restent dans le dossier
          Copilot jusqu’à sa suppression confirmée.
        </p>
      </div>
    </details>

    <div class="mt-4 grid gap-2 sm:grid-cols-2">
      {#each operations as operation (operation.kind)}
        <button
          type="button"
          class="flex items-center justify-between gap-3 rounded-lg border border-border-light bg-page-canvas px-3 py-2 text-left transition-colors hover:bg-subtle-gray disabled:cursor-not-allowed disabled:opacity-45"
          onclick={() => store.createJob(operation.kind)}
          disabled={!canCreateOperation(operation.kind)}
        >
          <span class="flex items-center gap-2 text-xs font-medium text-text-primary">
            <Icon name={operation.icon} size={13} class="text-blueprint-blue" />
            {operation.label}
          </span>
          <span class="text-[10px] text-text-muted">{operation.detail}</span>
        </button>
      {/each}
    </div>

    {#if store.job}
      <div class="mt-4 rounded-lg border border-border-light bg-page-canvas p-3" aria-live="polite">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-medium text-text-primary">{statusLabel(store.job.status)}</p>
            <p class="mt-0.5 text-[10px] text-text-muted">
              {store.job.kind === 'analysis' ? 'Analyse incluse' : `${store.job.creditCost} crédit`}
            </p>
          </div>
          {#if pollingStatuses.has(store.job.status)}
            <Icon name="loader-2" size={14} class="animate-spin text-blueprint-blue" />
          {/if}
        </div>

        {#if store.job.status === 'uncertain'}
          <p class="mt-2 text-[11px] leading-5 text-text-subtle">
            Eve ne permet pas de vérifier automatiquement cet effet distant. Le checkpoint et le
            crédit restent inchangés jusqu’à une réconciliation opérateur; aucun retry ni
            remboursement aveugle n’est lancé.
          </p>
        {/if}

        {#if store.job.tjmFacts}
          <div class="mt-3 rounded-lg border border-border-light bg-surface-white p-3">
            <p class="text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted">
              Repères locaux déterministes
            </p>
            <div class="mt-2 grid grid-cols-2 gap-2 text-[11px] text-text-secondary">
              <span>Mission : {formatEur(store.job.tjmFacts.missionDisplayedTjm)}</span>
              <span>Cible profil : {formatEur(store.job.tjmFacts.profileBounds.target)}</span>
              <span>Marché : {formatEur(store.job.tjmFacts.market.weightedAverage)}</span>
              <span>Confiance : {store.job.tjmFacts.confidence}</span>
            </div>
            <p class="mt-2 text-[10px] text-text-muted">
              {store.job.tjmFacts.market.sampleCount} observation{store.job.tjmFacts.market
                .sampleCount > 1
                ? 's'
                : ''}. Ces chiffres ne sont pas une recommandation Eve.
            </p>
          </div>
        {/if}

        {#if store.job.result && store.job.status === 'review'}
          <div class="mt-3 rounded-lg border border-border-light bg-surface-white p-3">
            <p class="text-[10px] font-medium uppercase tracking-[0.14em] text-blueprint-blue">
              Proposition IA non vérifiée
            </p>
            {#if groundedDraftText}
              <div class="mt-3 border-t border-border-light pt-3">
                <p class="text-[11px] font-medium text-text-primary">Sources à vérifier</p>
                <ol class="mt-2 space-y-3">
                  {#each groundedDraftSegments as segment, index (`${index}:${segment.text}`)}
                    <li class="text-xs leading-5 text-text-primary">
                      <span class="whitespace-pre-wrap">{segment.text}</span>
                      <span class="mt-1 block space-y-1 text-[10px] leading-4 text-text-muted">
                        {#each segment.sourceRefs as sourceRef (`${sourceRef.kind}:${sourceRef.id}`)}
                          <span class="block">
                            {sourceRefLabel(sourceRef)} — « {sourceRefExcerpt(sourceRef)} »
                          </span>
                        {/each}
                      </span>
                    </li>
                  {/each}
                </ol>
                <button
                  type="button"
                  class="mt-3 inline-flex items-center gap-2 rounded-lg border border-border-light px-3 py-2 text-xs font-medium text-text-primary hover:bg-subtle-gray"
                  onclick={() => onCopy(groundedDraftText ?? '')}
                >
                  <Icon name="check" size={12} /> Copier
                </button>
              </div>
            {:else if store.job.result.kind !== 'analysis'}
              <div
                class="mt-3 rounded-lg border border-status-red/20 bg-status-red/8 p-3"
                role="alert"
              >
                <p class="text-[11px] font-medium text-text-primary">Proposition non vérifiée</p>
                <p class="mt-1 text-[10px] leading-4 text-text-subtle">
                  Les segments ne disposent pas tous de sources consenties valides. Le contenu est
                  masqué et ne peut être ni copié ni conservé.
                </p>
              </div>
            {/if}
            {#if supportedEvidenceClaims.length > 0}
              <div class="mt-3 border-t border-border-light pt-3">
                <p class="text-[11px] font-medium text-text-primary">
                  Affirmations IA — sources à vérifier
                </p>
                <ul class="mt-2 space-y-2">
                  {#each supportedEvidenceClaims as claim (claim.text)}
                    <li class="text-[11px] leading-5 text-text-secondary">
                      <span>{claim.text}</span>
                      <span class="block text-[10px] text-text-muted">
                        {claim.evidenceIds
                          .map((id) => `${evidenceLabel(id)} — « ${evidenceExcerpt(id)} »`)
                          .join(' · ')}
                      </span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if store.job.result.gaps.length > 0}
              <p class="mt-3 text-[11px] leading-5 text-text-subtle">
                <span class="font-medium text-text-primary">Manques :</span>
                {store.job.result.gaps.join(' · ')}
              </p>
            {/if}
            {#if store.job.result.risks.length > 0}
              <p class="mt-2 text-[11px] leading-5 text-text-subtle">
                <span class="font-medium text-text-primary">Risques :</span>
                {store.job.result.risks.join(' · ')}
              </p>
            {/if}
            {#if store.job.result.questions.length > 0}
              <div class="mt-3 border-t border-border-light pt-3">
                <p class="text-[11px] font-medium text-text-primary">Questions à clarifier</p>
                <ul class="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-text-subtle">
                  {#each store.job.result.questions as question (question)}
                    <li>{question}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}

        <div class="mt-3 flex flex-wrap gap-2">
          {#if store.job.status === 'review'}
            <button
              type="button"
              class="rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              onclick={() => store.reviewJob('accept')}
              disabled={store.action !== null || !hasCompleteGroundedDraft}>Conserver</button
            >
            <button
              type="button"
              class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary disabled:opacity-50"
              onclick={() => store.reviewJob('reject')}
              disabled={store.action !== null}>Écarter</button
            >
          {:else if pollingStatuses.has(store.job.status) && store.job.jobId}
            <button
              type="button"
              class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary disabled:opacity-50"
              onclick={() => store.cancelJob()}
              disabled={store.action !== null}>Annuler le job</button
            >
          {/if}
          {#if store.job.status === 'failed'}
            <button
              type="button"
              class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-blueprint-blue disabled:opacity-50"
              onclick={() => store.refreshJob()}
              disabled={store.action !== null}>Vérifier maintenant</button
            >
          {/if}
        </div>
      </div>
    {/if}

    {#if store.error && store.error.code !== 'ROLLOUT_DISABLED'}
      <div
        class="mt-3 rounded-lg bg-status-red/8 px-3 py-2 text-[11px] leading-5 text-text-primary"
        role="alert"
      >
        {store.error.message}
      </div>
    {/if}
  {/if}

  {#if store.canDeleteDossier}
    <div class="mt-4 border-t border-border-light pt-3">
      {#if deleteConfirmation}
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-[11px] text-text-subtle">
            Supprimer les données Copilot de cette mission ?
          </p>
          <div class="flex gap-2">
            <button
              type="button"
              class="text-xs text-text-subtle"
              onclick={() => (deleteConfirmation = false)}>Annuler</button
            >
            <button
              type="button"
              class="text-xs font-medium text-status-red disabled:opacity-50"
              onclick={() => store.deleteDossier()}
              disabled={store.action !== null}>Confirmer</button
            >
          </div>
        </div>
      {:else}
        <button
          type="button"
          class="text-[11px] font-medium text-text-muted hover:text-status-red"
          onclick={() => (deleteConfirmation = true)}>Supprimer le dossier Copilot</button
        >
      {/if}
    </div>
  {/if}
</section>
