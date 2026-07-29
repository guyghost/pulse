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
      payload: { requestId: string; code: 'unavailable' | 'failed'; message: string };
    };

let booted = false;
let phase: Phase = 'disabled';
let activeTarget: HTMLElement | null = null;
let activeDescriptor: FieldDescriptor | null = null;
let widget: FormAssistWidget | null = null;
let requestIdCounter = 0;

function makeRequestId(): string {
  requestIdCounter += 1;
  return `fa-${Date.now().toString(36)}-${requestIdCounter}`;
}

/**
 * Applique une valeur à un champ en contournant les setters surchargés par les
 * frameworks (React/Svelte) : on appelle le setter natif du prototype puis on
 * émet l'événement `input` attendu par ces frameworks.
 */
function applyValue(element: HTMLElement, value: string): void {
  if (element.isContentEditable) {
    element.focus();
    try {
      document.execCommand('selectAll');
      document.execCommand('insertText', false, value);
    } catch {
      element.textContent = value;
    }
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
    return;
  }

  const tag = element.tagName.toLowerCase();
  const proto =
    tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    (element as HTMLInputElement).value = value;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
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
  phase = 'idle';
  activeTarget = null;
  activeDescriptor = null;
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
  try {
    applyValue(activeTarget, text);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[MissionPulse FormAssistant] applyValue failed:', err);
    }
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

  // L'utilisateur a peut-être changé de champ entre-temps.
  if (phase !== 'requesting' || activeTarget !== target) {
    return;
  }

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
      response.payload.code === 'unavailable' ? 'IA locale indisponible' : 'Échec de génération',
  });
}

function handleFocusIn(event: FocusEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target || target === activeTarget) {
    return;
  }

  const descriptor = detectFieldDescriptor(target);
  if (!descriptor) {
    resetToIdle();
    return;
  }

  activeTarget = target;
  activeDescriptor = descriptor;
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

function arm(): void {
  if (phase !== 'disabled') {
    return;
  }
  phase = 'idle';
  document.addEventListener('focusin', handleFocusIn, true);
  document.addEventListener('keydown', handleKeyDown, true);
}

function disarm(): void {
  document.removeEventListener('focusin', handleFocusIn, true);
  document.removeEventListener('keydown', handleKeyDown, true);
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
