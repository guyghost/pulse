<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { Badge, Button, Icon } from '@pulse/ui';
  import type { Experience } from '$lib/core/types/profile';
  import { formatExperienceDateRange } from '$lib/core/cv/experience-helpers';
  import {
    createCvExperienceCardAccessibilityActor,
    createExperienceCardInput,
    createNativeToggleActivationPort,
    decodeExperienceCardInputEvent,
    decodeExperienceCardMachineEvent,
    haveParentCallbackSettlementsCompleted,
    type ExperienceCardFocusTarget,
    type ExperienceCardFocusedControl,
    type FocusExitRequest,
    type FocusExitResult,
  } from '../../models/cv-experience-card-accessibility.machine';
  import ExperienceEditForm, { type ExperienceFormData } from './ExperienceEditForm.svelte';

  /**
   * Single experience row. The accessibility machine is the sole source of
   * truth for identity, expansion, edit projection and callback delivery.
   */
  const {
    experience,
    isEditing = false,
    isBusy = false,
    draft = null,
    onEdit,
    onDelete,
    onSave,
    onCancelEdit,
    onFocusExitRequest,
  }: {
    experience: Experience;
    isEditing?: boolean;
    isBusy?: boolean;
    draft?: Experience | null;
    onEdit?: () => void | PromiseLike<void>;
    onDelete?: () => void | PromiseLike<void>;
    onSave?: (experience: Experience) => void | PromiseLike<void>;
    onCancelEdit?: () => void | PromiseLike<void>;
    onFocusExitRequest?: (request: FocusExitRequest) => FocusExitResult;
  } = $props();

  const instanceSuffix = $props.id();
  const initialInput = createExperienceCardInput(
    untrack(() => ({
      experience,
      isEditing,
      isBusy,
      draft,
      onEdit,
      onDelete,
      onSave,
      onCancelEdit,
      onFocusExitRequest,
    }))
  );
  const actor = createCvExperienceCardAccessibilityActor({
    input: initialInput,
    instanceSuffix,
  });
  let snapshot = $state(actor.getSnapshot());
  const subscription = actor.subscribe((nextSnapshot) => {
    snapshot = nextSnapshot;
  });
  actor.start();

  function sendMachineEvent(value: unknown): void {
    const event = decodeExperienceCardMachineEvent(value);
    if (event !== null) {
      actor.send(event);
    }
  }

  let articleElement = $state<HTMLElement | null>(null);
  let handledFocusRequest = $state<object | null>(null);
  let machineDestroyed = false;
  let terminalSettlementSubscription: { unsubscribe(): void } | null = null;

  const ownedExperience = $derived(snapshot.context.input.experience);
  const ownedDraft = $derived(snapshot.context.input.draft);
  const dateRange = $derived(formatExperienceDateRange(ownedExperience));
  const isDisplay = $derived(snapshot.matches('display'));
  const isExpanded = $derived(snapshot.matches({ display: 'expanded' }));
  const isEditingState = $derived(snapshot.matches('editing'));
  const isUnavailable = $derived(snapshot.matches('unavailable'));
  const isTerminal = $derived(snapshot.matches('terminal'));

  const sourceLabel = $derived(
    ownedExperience.source === 'linkedin'
      ? 'LinkedIn'
      : ownedExperience.source === 'connector-import'
        ? 'Import connecteur'
        : 'Manuel'
  );

  function focusedControl(): ExperienceCardFocusedControl {
    const active = document.activeElement;
    if (articleElement === null || active === null || !articleElement.contains(active)) {
      return 'other';
    }
    if (active === articleElement) {
      return 'article';
    }
    if (active instanceof HTMLElement) {
      const control = active.dataset.experienceControl;
      if (
        control === 'toggle' ||
        control === 'edit' ||
        control === 'delete' ||
        control === 'title' ||
        control === 'save' ||
        control === 'cancel' ||
        control === 'current'
      ) {
        return control;
      }
    }
    const details = articleElement.ownerDocument.getElementById(snapshot.context.detailsId);
    return details !== null && articleElement.contains(details) && details.contains(active)
      ? 'details'
      : 'other_owned';
  }

  function focusRequestedTarget(target: ExperienceCardFocusTarget): void {
    if (articleElement === null || !articleElement.isConnected) {
      return;
    }
    if (target === 'article') {
      articleElement.focus();
      return;
    }
    const element = articleElement.querySelector<HTMLElement>(
      `[data-experience-focus="${target}"]`
    );
    if (element !== null && !element.hasAttribute('disabled')) {
      element.focus();
    } else {
      articleElement.focus();
    }
  }

  $effect.pre(() => {
    const nextInput = createExperienceCardInput({
      experience,
      isEditing,
      isBusy,
      draft,
      onEdit,
      onDelete,
      onSave,
      onCancelEdit,
      onFocusExitRequest,
    });
    const event = decodeExperienceCardInputEvent(
      snapshot.context.input,
      nextInput,
      untrack(focusedControl)
    );
    if (event !== null) {
      sendMachineEvent(event);
    }
  });

  $effect(() => {
    const request = snapshot.context.focusRequest;
    if (request === null || request === handledFocusRequest) {
      return;
    }
    handledFocusRequest = request;
    void tick().then(() => focusRequestedTarget(request.target));
  });

  function destroyMachine(node: HTMLElement | null, ownedFocus?: boolean): void {
    if (machineDestroyed) {
      return;
    }
    machineDestroyed = true;
    const ownsFocus =
      ownedFocus ??
      (node !== null && document.activeElement !== null && node.contains(document.activeElement));
    sendMachineEvent({ type: 'COMPONENT_DESTROYED', ownsFocus });
    subscription.unsubscribe();
    if (haveParentCallbackSettlementsCompleted(actor.getSnapshot().context)) {
      actor.stop();
      return;
    }
    terminalSettlementSubscription = actor.subscribe((nextSnapshot) => {
      if (
        nextSnapshot.matches('terminal') &&
        haveParentCallbackSettlementsCompleted(nextSnapshot.context)
      ) {
        queueMicrotask(() => {
          terminalSettlementSubscription?.unsubscribe();
          terminalSettlementSubscription = null;
          actor.stop();
        });
      }
    });
  }

  function cardLifecycle(node: HTMLElement): { destroy(): void } {
    articleElement = node;
    let ownsFocus = node.contains(document.activeElement);
    const handleFocusIn = (): void => {
      ownsFocus = true;
    };
    const handleFocusOut = (event: FocusEvent): void => {
      if (event.relatedTarget instanceof Node) {
        ownsFocus = node.contains(event.relatedTarget);
      } else if (node.isConnected) {
        ownsFocus = false;
      }
    };
    node.addEventListener('focusin', handleFocusIn);
    node.addEventListener('focusout', handleFocusOut);
    return {
      destroy() {
        destroyMachine(node, ownsFocus);
        node.removeEventListener('focusin', handleFocusIn);
        node.removeEventListener('focusout', handleFocusOut);
        articleElement = null;
      },
    };
  }

  onDestroy(() => destroyMachine(articleElement));

  const toggleActivationPort = createNativeToggleActivationPort((source) => {
    sendMachineEvent({
      type: 'TOGGLE_REQUESTED',
      owner: instanceSuffix,
      source,
    });
  });

  function handleToggleKeydown(event: KeyboardEvent): void {
    toggleActivationPort.keydown(event.key);
  }

  function handleToggle(event: MouseEvent): void {
    toggleActivationPort.click(event.detail);
  }

  function handleSave(data: ExperienceFormData): void {
    sendMachineEvent({ type: 'EDIT_SAVE_REQUESTED', payload: data });
  }

  function handleCancelEdit(): void {
    sendMachineEvent({ type: 'EDIT_CANCEL_REQUESTED' });
  }
</script>

{#snippet summary()}
  <div class="min-w-0 flex-1">
    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h3 class="truncate text-sm font-semibold text-text-primary">
        {snapshot.context.projection.displayTitle}
      </h3>
      <span class="text-xs text-text-muted">·</span>
      <span class="truncate text-sm text-text-secondary">
        {snapshot.context.projection.displayCompany}
      </span>
    </div>
    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-subtle">
      <span class="inline-flex items-center gap-1">
        <Icon name="calendar-clock" size={12} />
        {dateRange}
      </span>
      {#if ownedExperience.employmentType}
        <span>{ownedExperience.employmentType}</span>
      {/if}
      {#if ownedExperience.location}
        <span>{ownedExperience.location}</span>
      {/if}
      {#if ownedExperience.isCurrent}
        <Badge label="Actuel" variant="success" size="sm" />
      {/if}
    </div>
  </div>
{/snippet}

{#snippet mutationActions()}
  {#if typeof snapshot.context.input.onEdit === 'function'}
    <Button
      variant="ghost"
      size="sm"
      onclick={() => sendMachineEvent({ type: 'EDIT_REQUESTED' })}
      disabled={snapshot.context.input.isBusy}
      aria-label="Modifier"
      data-experience-control="edit"
    >
      <Icon name="edit-2" size={14} />
    </Button>
  {/if}
  {#if typeof snapshot.context.input.onDelete === 'function'}
    <Button
      variant="ghost"
      size="sm"
      onclick={() => sendMachineEvent({ type: 'DELETE_REQUESTED' })}
      disabled={snapshot.context.input.isBusy}
      aria-label="Supprimer"
      data-experience-control="delete"
      class="hover:text-status-red"
    >
      <Icon name="trash-2" size={14} />
    </Button>
  {/if}
{/snippet}

{#if !isTerminal}
  <!-- svelte-ignore a11y_no_redundant_roles (the reviewed A3 contract requires an explicit role) -->
  <article
    use:cardLifecycle
    role="article"
    aria-label={snapshot.context.projection.cardName}
    tabindex="-1"
    class="section-card rounded-xl p-4"
    data-cv-experience-article
    data-experience-id={ownedExperience.id}
    data-position-index={ownedExperience.positionIndex}
  >
    {#if isEditingState && ownedDraft !== null}
      <div>
        <div class="mb-3 flex items-center gap-2">
          <Icon name="edit-2" size={14} class="text-blueprint-blue" />
          <span class="text-xs font-medium text-text-secondary">
            {ownedExperience.title ? 'Modifier l’expérience' : 'Nouvelle expérience'}
          </span>
        </div>
        <ExperienceEditForm
          draft={ownedDraft}
          isBusy={snapshot.context.input.isBusy}
          onSave={typeof snapshot.context.input.onSave === 'function' ? handleSave : undefined}
          onCancel={typeof snapshot.context.input.onCancelEdit === 'function'
            ? handleCancelEdit
            : undefined}
        />
      </div>
    {:else if isDisplay}
      <div class="flex items-start gap-3">
        <button
          type="button"
          onclick={handleToggle}
          onkeydown={handleToggleKeydown}
          class="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-label={snapshot.context.projection.toggleName}
          aria-expanded={isExpanded}
          aria-controls={snapshot.context.detailsId}
          data-experience-control="toggle"
        >
          {@render summary()}
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            class="mt-0.5 shrink-0 text-text-muted"
          />
        </button>

        <div class="flex shrink-0 items-center gap-1">
          {@render mutationActions()}
        </div>
      </div>

      {#if isExpanded}
        <div
          id={snapshot.context.detailsId}
          role="region"
          aria-label={snapshot.context.projection.regionName}
          class="mt-3 space-y-3 border-t border-border-light pt-3"
        >
          {#if snapshot.context.projection.normalizedDescription}
            <p class="whitespace-pre-line text-xs leading-relaxed text-text-secondary">
              {snapshot.context.projection.normalizedDescription}
            </p>
          {/if}
          {#if snapshot.context.projection.normalizedSkills.length > 0}
            <div class="flex flex-wrap gap-1.5">
              {#each snapshot.context.projection.normalizedSkills as skill, index (`${skill}-${index}`)}
                <Badge label={skill} variant="tech" size="sm" />
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <div class="mt-2 flex items-center justify-between">
        <span class="text-[10px] uppercase tracking-wide text-text-muted">{sourceLabel}</span>
        {#if snapshot.context.input.isBusy}
          <span class="inline-flex items-center gap-1 text-[10px] text-text-muted">
            <Icon name="loader-2" size={11} class="animate-spin" />
            Enregistrement…
          </span>
        {/if}
      </div>
    {:else if isUnavailable}
      <div class="flex items-start gap-3">
        <div class="flex min-w-0 flex-1 items-start gap-3">
          {@render summary()}
        </div>
        {#if snapshot.context.unavailableReason === 'no_details'}
          <div class="flex shrink-0 items-center gap-1">
            {@render mutationActions()}
          </div>
        {/if}
      </div>
      <div class="mt-2 flex items-center justify-between">
        <span class="text-[10px] uppercase tracking-wide text-text-muted">{sourceLabel}</span>
        {#if snapshot.context.input.isBusy}
          <span class="inline-flex items-center gap-1 text-[10px] text-text-muted">
            <Icon name="loader-2" size={11} class="animate-spin" />
            Enregistrement…
          </span>
        {/if}
      </div>
    {/if}
  </article>
{/if}
