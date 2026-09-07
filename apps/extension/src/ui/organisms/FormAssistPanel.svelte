<script lang="ts">
  import { Icon } from '@pulse/ui';
  import type { FieldSuggestion, SuggestionDecision } from '@pulse/domain';
  import type {
    FormAssistDecision,
    FormAssistError,
    FormAssistRequestResult,
  } from '$lib/shell/ai/form-assist';
  import { applyFormAssist, requestFormAssist } from '$lib/shell/facades/form-assist.facade';
  import { showToast } from '$lib/shell/notifications/toast-service';

  type ReviewDecision = {
    decision: SuggestionDecision;
    value: string;
  };

  let consentApproved = $state(false);
  let loading = $state(false);
  let requestResult = $state<FormAssistRequestResult | null>(null);
  let review = $state<Record<string, ReviewDecision>>({});

  const errorLabels: Record<FormAssistError, string> = {
    CONSENT_REQUIRED: 'Le consentement explicite est requis avant toute capture.',
    ACCOUNT_REQUIRED: 'Connectez cette extension à votre compte MissionPulse.',
    PREMIUM_REQUIRED: 'Cette assistance est incluse dans Premium à 10 € TTC/an.',
    UNSUPPORTED_ORIGIN: 'Ouvrez un formulaire sur une plateforme actuellement supportée.',
    PERMISSION_DENIED: 'La permission de lire ce formulaire a été refusée.',
    NO_ACTIVE_TAB: 'Aucun onglet de candidature actif.',
    NO_PROFILE: 'Complétez votre profil MissionPulse avant de demander des suggestions.',
    NO_SUPPORTED_FIELDS: 'Aucun champ autorisé n’a été détecté sur cette page.',
    CAPTURE_FAILED: 'Le formulaire n’a pas pu être lu. Vous pouvez réessayer.',
    AI_UNAVAILABLE: 'L’IA locale de Chrome n’est pas disponible sur cet appareil.',
    AI_FAILED: 'L’IA locale n’a pas répondu. Vous pouvez réessayer.',
    AI_OUTPUT_INVALID: 'Les suggestions locales n’ont pas passé la validation de sécurité.',
    SESSION_EXPIRED: 'La session de revue a expiré. Relancez une analyse.',
    FORM_CHANGED: 'Le formulaire a changé depuis la revue. Relancez une analyse.',
    APPLY_FAILED: 'Aucun champ n’a été modifié; vous pouvez réessayer.',
    MANUAL_REVIEW_REQUIRED:
      'Une écriture n’a pas pu être confirmée. Vérifiez manuellement le formulaire.',
  };

  const successfulResult = $derived(requestResult?.ok ? requestResult : null);

  function fieldLabel(suggestion: FieldSuggestion): string {
    const field = successfulResult?.fields.find(
      (candidate) => candidate.fieldId === suggestion.fieldId
    );
    return field?.label || suggestion.fieldId;
  }

  async function analyzeForm(): Promise<void> {
    loading = true;
    try {
      const result = await requestFormAssist(consentApproved);
      requestResult = result;
      review = {};
      if (result.ok) {
        review = Object.fromEntries(
          result.suggestions.map((suggestion) => [
            suggestion.suggestionId,
            { decision: 'pending' as const, value: suggestion.proposedValue },
          ])
        );
      }
    } finally {
      loading = false;
    }
  }

  function toggleApproval(suggestion: FieldSuggestion, approved: boolean): void {
    const current = review[suggestion.suggestionId] ?? {
      decision: 'pending' as const,
      value: suggestion.proposedValue,
    };
    review = {
      ...review,
      [suggestion.suggestionId]: {
        ...current,
        decision: approved
          ? current.value === suggestion.proposedValue
            ? 'approved'
            : 'approved_edited'
          : 'refused',
      },
    };
  }

  function updateValue(suggestion: FieldSuggestion, value: string): void {
    const current = review[suggestion.suggestionId] ?? {
      decision: 'pending' as const,
      value: suggestion.proposedValue,
    };
    const approved = current.decision === 'approved' || current.decision === 'approved_edited';
    review = {
      ...review,
      [suggestion.suggestionId]: {
        value,
        decision: approved
          ? value === suggestion.proposedValue
            ? 'approved'
            : 'approved_edited'
          : current.decision,
      },
    };
  }

  async function applyReviewed(refuseAll = false): Promise<void> {
    if (!successfulResult) {
      return;
    }
    loading = true;
    try {
      const decisions: FormAssistDecision[] = successfulResult.suggestions.map((suggestion) => {
        const item = review[suggestion.suggestionId];
        return {
          suggestionId: suggestion.suggestionId,
          decision: refuseAll ? 'refused' : (item?.decision ?? 'pending'),
          editedValue: item?.value,
        };
      });
      const result = await applyFormAssist(successfulResult.sessionId, decisions);
      if (result.ok) {
        await showToast(
          result.state === 'applied'
            ? `${result.appliedCount} champ${result.appliedCount > 1 ? 's' : ''} rempli${result.appliedCount > 1 ? 's' : ''}; vérifiez avant de soumettre.`
            : 'Toutes les suggestions ont été refusées.',
          'success'
        );
        requestResult = null;
        review = {};
        consentApproved = false;
        return;
      }
      requestResult = { ok: false, state: result.state, error: result.error };
    } finally {
      loading = false;
    }
  }
</script>

<section class="section-card rounded-xl p-5" aria-labelledby="form-assist-title">
  <div class="flex items-start justify-between gap-3">
    <div>
      <p class="eyebrow eyebrow--strong eyebrow--blue">Premium · local-first</p>
      <h3 id="form-assist-title" class="mt-1 text-sm font-semibold text-text-primary">
        Assistance au formulaire actif
      </h3>
      <p class="mt-1 text-xs leading-5 text-text-subtle">
        Pulse propose des valeurs avec l’IA locale de Chrome. Vous approuvez chaque champ; Pulse ne
        soumet jamais le formulaire.
      </p>
    </div>
    <Icon name="sparkles" size={17} class="shrink-0 text-blueprint-blue" />
  </div>

  {#if successfulResult}
    <div class="mt-4 space-y-3">
      <p class="text-[11px] text-text-muted">
        {successfulResult.suggestions.length} suggestion{successfulResult.suggestions.length > 1
          ? 's'
          : ''} validée{successfulResult.suggestions.length > 1 ? 's' : ''} pour
        {successfulResult.origin}.
      </p>
      {#each successfulResult.suggestions as suggestion (suggestion.suggestionId)}
        <article class="rounded-lg border border-border-light bg-page-canvas p-3">
          <label class="flex items-start gap-2">
            <input
              type="checkbox"
              class="mt-0.5"
              checked={review[suggestion.suggestionId]?.decision === 'approved' ||
                review[suggestion.suggestionId]?.decision === 'approved_edited'}
              onchange={(event) =>
                toggleApproval(suggestion, (event.currentTarget as HTMLInputElement).checked)}
            />
            <span>
              <strong class="block text-xs text-text-primary">{fieldLabel(suggestion)}</strong>
              <span class="mt-0.5 block text-[11px] leading-4 text-text-muted">
                {suggestion.rationale}
              </span>
            </span>
          </label>
          <textarea
            class="mt-2 min-h-20 w-full rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs leading-5 text-text-primary outline-none focus:border-blueprint-blue/30"
            value={review[suggestion.suggestionId]?.value ?? suggestion.proposedValue}
            oninput={(event) =>
              updateValue(suggestion, (event.currentTarget as HTMLTextAreaElement).value)}
            aria-label={`Valeur proposée pour ${fieldLabel(suggestion)}`}></textarea>
        </article>
      {/each}
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          disabled={loading}
          onclick={() => applyReviewed(false)}
        >
          Vérifier et remplir les champs approuvés
        </button>
        <button
          type="button"
          class="rounded-lg border border-border-light bg-surface-white px-3 py-2 text-xs font-medium text-text-primary"
          disabled={loading}
          onclick={() => applyReviewed(true)}
        >
          Tout refuser
        </button>
      </div>
    </div>
  {:else}
    <label
      class="mt-4 flex items-start gap-2 rounded-lg border border-border-light bg-page-canvas p-3"
    >
      <input type="checkbox" class="mt-0.5" bind:checked={consentApproved} />
      <span class="text-[11px] leading-5 text-text-subtle">
        J’autorise Pulse à lire les champs non sensibles de l’onglet actif et à les traiter
        localement pour cette tentative. Aucun envoi cloud.
      </span>
    </label>

    {#if requestResult && !requestResult.ok}
      <p
        class="mt-3 rounded-lg border border-status-red/25 bg-status-red/5 p-3 text-xs text-status-red"
        role="alert"
      >
        {errorLabels[requestResult.error]}
      </p>
    {/if}

    <button
      type="button"
      class="mt-3 inline-flex items-center gap-2 rounded-lg bg-blueprint-blue px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
      disabled={!consentApproved || loading}
      onclick={analyzeForm}
    >
      <Icon
        name={loading ? 'loader' : 'sparkles'}
        size={13}
        class={loading ? 'animate-spin' : ''}
      />
      {loading ? 'Analyse locale…' : 'Analyser le formulaire actif'}
    </button>
  {/if}
</section>
