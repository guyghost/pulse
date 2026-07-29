/**
 * Content script — Form Assistant orchestrator (Machine A).
 *
 * Source de vérité : src/models/form-assistant.model.md (Machine A).
 *
 * États : disabled → idle → armed → requesting → ready → applying → filled
 *
 * Le content script ne décide JAMAIS de transitions métier : il délègue la
 * génération au service worker (qui applique Machine B) et se contente
 * d'afficher/insérer les propositions acceptées explicitement par l'utilisateur.
 */
import type { FieldDescriptor } from '../../lib/core/form-assistant/types';
import { detectFieldDescriptor } from './field-detector';
import { FormAssistWidget } from './widget';

type Phase = 'disabled' | 'idle' | 'armed' | 'requesting' | 'ready' | 'applying' | 'filled';

type FormAssistResponse =
  | {
      type: 'FORM_ASSIST_PROPOSAL';
      payload: { requestId: string; text: string; engine: 'local' | 'remote' };
    }
  | {
      type: 'FORM_ASSIST_ERROR';
      payload: {
        requestId: string;
        code: 'unavailable' | 'failed' | 'cancelled';
        message: string;
      };
    };

let booted = false;
let phase: Phase = 'disabled';
let activeTarget: HTMLElement | null = null;
let activeDescriptor: FieldDescriptor | null = null;
let widget: FormAssistWidget | null = null;
let requestIdCounter = 0;
let activeRequestId: string | null = null;

function makeRequestId(): string {
  requestIdCounter += 1;
  return `fa-${Date.now().toString(36)}-${requestIdCounter}`;
}

/**
 * Annule une éventuelle requête de génération en cours côté service worker.
 * Cohérent avec la transition `requesting CANCEL → armed` du modèle.
 */
function cancelInFlightRequest(): void {
  const id = activeRequestId;
  activeRequestId = null;
  if (!id) {
    return;
  }
  try {
    void chrome.runtime
      .sendMessage({ type: 'FORM_ASSIST_CANCEL', payload: { requestId: id } })
      .catch(() => {
        /* SW injoignable : la garde anti-response périmée gère le cas. */
      });
  } catch {
    /* no-op */
  }
}

/**
 * Applique une valeur à un champ en contournant les setters surchargés par les
 * frameworks (React/Svelte) : on appelle le setter natif du prototype puis on
 * émet l'événement `input` attendu par ces frameworks.
 *
 * Retourne `false` si l'écriture n'a pas pu être effectuée (ex : contenteditable
 * avec execCommand indisponible), pour que l'orchestrateur puisse rester dans un
 * état interactif plutôt que de masquer silencieusement l'échec.
 */
function applyValue(element: HTMLElement, value: string): boolean {
  if (element.isContentEditable) {
    element.focus();
    let ok = true;
    try {
      document.execCommand('selectAll');
      ok = document.execCommand('insertText', false, value);
    } catch {
      element.textContent = value;
      ok = element.textContent === value;
    }
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
    return ok;
  }

  const tag = element.tagName.toLowerCase();
  const proto =
    tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  try {
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      (element as HTMLInputElement).value = value;
    }
  } catch {
    return false;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function ensureWidget(): FormAssistWidget {
  if (!widget) {
    widget = new FormAssistWidget({
      onTrigger: handleTrigger,
      onAccept: handleAccept,
      onDismiss: handleDismiss,
    });
  }
  return widget;
}

function resetToIdle(): void {
  if (phase === 'requesting') {
    cancelInFlightRequest();
  }
  phase = 'idle';
  activeTarget = null;
  activeDescriptor = null;
  activeRequestId = null;
  widget?.hide();
}

function handleTrigger(): void {
  if (phase !== 'armed' || !activeDescriptor || !activeTarget) {
    return;
  }
  void requestProposal(activeTarget, activeDescriptor);
}

function handleAccept(text: string): void {
  if (phase !== 'ready' || !activeTarget) {
    return;
  }
  phase = 'applying';
  let ok = true;
  try {
    ok = applyValue(activeTarget, text);
  } catch (err) {
    ok = false;
    if (import.meta.env.DEV) {
      console.warn('[MissionPulse FormAssistant] applyValue failed:', err);
    }
  }
  if (!ok) {
    // Rester dans un état interactif : l'utilisateur peut réessayer ou ignorer,
    // plutôt que de masquer silencieusement un échec d'insertion.
    phase = 'ready';
    widget?.show(activeTarget, { kind: 'error', message: "Impossible d'insérer la valeur" });
    return;
  }
  phase = 'filled';
  resetToIdle();
}

function handleDismiss(): void {
  resetToIdle();
}

async function requestProposal(target: HTMLElement, field: FieldDescriptor): Promise<void> {
  phase = 'requesting';
  const w = ensureWidget();
  w.show(target, { kind: 'requesting' });

  const requestId = makeRequestId();
  activeRequestId = requestId;
  const message = {
    type: 'FORM_ASSIST_REQUEST' as const,
    payload: { requestId, field },
  };

  let response: FormAssistResponse | undefined;
  try {
    response = (await chrome.runtime.sendMessage(message)) as FormAssistResponse | undefined;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[MissionPulse FormAssistant] bridge error:', err);
    }
  }

  // L'utilisateur a peut-être changé de champ, dismissé, ou annulé entre-temps.
  if (phase !== 'requesting' || activeTarget !== target || activeRequestId !== requestId) {
    return;
  }
  activeRequestId = null;

  if (!response) {
    w.show(target, { kind: 'error', message: 'Service injoignable' });
    return;
  }

  if (response.type === 'FORM_ASSIST_PROPOSAL') {
    phase = 'ready';
    w.show(target, { kind: 'ready', text: response.payload.text });
    return;
  }

  w.show(target, {
    kind: 'error',
    message:
      response.payload.code === 'unavailable'
        ? 'IA locale indisponible'
        : response.payload.code === 'cancelled'
          ? 'Génération annulée'
          : 'Échec de génération',
  });
}

function handleFocusIn(event: FocusEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target || target === activeTarget) {
    return;
  }
  // Ignore les focus internes au widget (clics sur ses boutons, etc.).
  if (widget?.isHostElement(target)) {
    return;
  }
  // Changement de champ : on annule une éventuelle requête en cours pour l'ancien.
  if (phase === 'requesting') {
    cancelInFlightRequest();
  }

  const descriptor = detectFieldDescriptor(target);
  if (!descriptor) {
    resetToIdle();
    return;
  }

  activeTarget = target;
  activeDescriptor = descriptor;
  activeRequestId = null;
  phase = 'armed';
  ensureWidget().show(target, { kind: 'armed' });
}

function handleKeyDown(event: KeyboardEvent): void {
  if (
    event.key === 'Escape' &&
    (phase === 'armed' || phase === 'ready' || phase === 'requesting')
  ) {
    resetToIdle();
  }
}

/**
 * Ferme le widget quand l'utilisateur clique en dehors du champ actif et du
 * widget (comportement type Grammarly). On utilise `mousedown` plutôt que
 * `focusout`/`blur` car le target d'un mousedown observé au niveau document est
 * fiable y compris avec un shadow root closed (retargeting vers le host).
 */
function handleDocumentMouseDown(event: MouseEvent): void {
  if (!activeTarget || phase === 'disabled' || phase === 'idle') {
    return;
  }
  const target = event.target as Node | null;
  if (!target) {
    return;
  }
  if (activeTarget.contains(target) || widget?.isHostElement(target)) {
    return;
  }
  resetToIdle();
}

function arm(): void {
  if (phase !== 'disabled') {
    return;
  }
  phase = 'idle';
  document.addEventListener('focusin', handleFocusIn, true);
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('mousedown', handleDocumentMouseDown, true);
}

function disarm(): void {
  document.removeEventListener('focusin', handleFocusIn, true);
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('mousedown', handleDocumentMouseDown, true);
  resetToIdle();
  phase = 'disabled';
  widget?.destroy();
  widget = null;
}

function applyEnabledState(enabled: boolean): void {
  if (enabled) {
    arm();
  } else {
    disarm();
  }
}

function init(): void {
  if (booted) {
    return;
  }
  booted = true;

  void chrome.runtime
    .sendMessage({ type: 'FORM_ASSIST_STATUS' })
    .then(
      (
        result: { type: 'FORM_ASSIST_STATUS_RESULT'; payload: { enabled: boolean } } | undefined
      ) => {
        applyEnabledState(Boolean(result?.payload.enabled));
      }
    )
    .catch(() => {
      // SW injoignable (rare) → reste désactivé par sécurité.
      applyEnabledState(false);
    });

  // Réagit aux changements de réglage venant du side panel.
  chrome.runtime.onMessage.addListener((message: { type: string; payload?: unknown }) => {
    if (message.type === 'FORM_ASSIST_ENABLED') {
      const payload = message.payload as { enabled: boolean } | undefined;
      applyEnabledState(Boolean(payload?.enabled));
    }
  });
}

init();
