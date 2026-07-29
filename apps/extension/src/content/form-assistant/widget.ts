/**
 * Content script — Form Assistant widget (Shadow DOM, closed).
 *
 * Floating UI anchored near the focused field. Isoled du CSS de la page hôte
 * via un shadow root closed. Aucune logique métier : se contente d'afficher des
 * états et d'émettre des callbacks (trigger / accept / dismiss).
 *
 * Les états reflètent la Machine A (src/models/form-assistant.model.md).
 */
export type WidgetViewState =
  | { kind: 'armed' }
  | { kind: 'requesting' }
  | { kind: 'ready'; text: string }
  | { kind: 'error'; message: string };

export interface WidgetCallbacks {
  onTrigger: () => void;
  onAccept: (text: string) => void;
  onDismiss: () => void;
}

const SHADOW_CSS = `
  :host { all: initial; }
  .mp-root {
    position: fixed;
    z-index: 2147483646;
    max-width: 340px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
    font-size: 13px;
    color: #0c0a09;
    background: #ffffff;
    border: 1px solid #f0efef;
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(12, 10, 9, 0.14), 0 2px 6px rgba(12, 10, 9, 0.06);
    overflow: hidden;
  }
  .mp-root[hidden] { display: none; }

  .mp-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #0b64e9;
    font-weight: 600;
    font-size: 13px;
  }
  .mp-trigger:hover { background: #f5f5f4; }
  .mp-trigger[disabled] { cursor: default; opacity: 0.7; }
  .mp-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #0b64e9; flex: 0 0 auto;
  }
  .mp-spinner {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid #d4d2d1; border-top-color: #0b64e9;
    animation: mp-spin 0.7s linear infinite; flex: 0 0 auto;
  }
  @keyframes mp-spin { to { transform: rotate(360deg); } }

  .mp-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
  .mp-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
    color: #57534d; font-weight: 600;
  }
  .mp-text {
    font-size: 13px; line-height: 1.45; color: #1c1917;
    white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow: auto;
  }
  .mp-actions { display: flex; gap: 6px; justify-content: flex-end; }
  .mp-btn {
    border: 1px solid #d4d2d1; background: #ffffff; color: #1c1917;
    padding: 6px 12px; border-radius: 7px; font-size: 12px; font-weight: 600;
    cursor: pointer;
  }
  .mp-btn:hover { background: #f5f5f4; }
  .mp-btn-primary { background: #0b64e9; border-color: #0b64e9; color: #ffffff; }
  .mp-btn-primary:hover { background: #0a57c7; }
  .mp-error { color: #f24149; font-size: 12px; }
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class FormAssistWidget {
  private readonly host: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly root: HTMLDivElement;
  private readonly callbacks: WidgetCallbacks;

  constructor(callbacks: WidgetCallbacks) {
    this.callbacks = callbacks;
    this.host = document.createElement('div');
    this.host.id = 'missionpulse-form-assist';
    this.host.style.all = 'initial';
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    this.shadow.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'mp-root';
    this.root.setAttribute('hidden', '');
    this.shadow.appendChild(this.root);

    this.root.addEventListener('click', this.handleClick);
    document.documentElement.appendChild(this.host);
  }

  private handleClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const action = target.dataset.action;
    if (action === 'trigger') {
      this.callbacks.onTrigger();
    } else if (action === 'accept') {
      const text = target.dataset.text ?? '';
      this.callbacks.onAccept(text);
    } else if (action === 'dismiss') {
      this.callbacks.onDismiss();
    }
  };

  /** Positionne le widget relativement au rect (viewport) de la cible. */
  private anchorTo(target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    const margin = 8;
    const top = rect.bottom + margin;
    // Aligné à gauche du champ, replié si débordement à droite.
    const preferredLeft = rect.left;
    this.root.style.top = `${Math.round(top)}px`;
    this.root.style.left = `${Math.round(Math.max(margin, preferredLeft))}px`;
    // Si débordement vertical (champ en bas de page), on passe au-dessus.
    const rootHeight = this.root.offsetHeight || 120;
    if (top + rootHeight > window.innerHeight - margin) {
      this.root.style.top = `${Math.round(Math.max(margin, rect.top - rootHeight - margin))}px`;
    }
  }

  show(target: HTMLElement, state: WidgetViewState): void {
    this.root.removeAttribute('hidden');
    this.render(state);
    this.anchorTo(target);
  }

  hide(): void {
    this.root.setAttribute('hidden', '');
    this.root.innerHTML = '';
  }

  private render(state: WidgetViewState): void {
    switch (state.kind) {
      case 'armed':
        this.root.innerHTML = `
          <button class="mp-trigger" data-action="trigger" type="button">
            <span class="mp-dot"></span>
            <span>Proposer avec MissionPulse</span>
          </button>`;
        break;
      case 'requesting':
        this.root.innerHTML = `
          <button class="mp-trigger" type="button" disabled>
            <span class="mp-spinner"></span>
            <span>Génération…</span>
          </button>`;
        break;
      case 'ready':
        this.root.innerHTML = `
          <div class="mp-body">
            <span class="mp-label">Proposition MissionPulse</span>
            <div class="mp-text">${escapeHtml(state.text)}</div>
            <div class="mp-actions">
              <button class="mp-btn" data-action="dismiss" type="button">Ignorer</button>
              <button class="mp-btn mp-btn-primary" data-action="accept" data-text="${escapeHtml(state.text)}" type="button">Insérer</button>
            </div>
          </div>`;
        break;
      case 'error':
        this.root.innerHTML = `
          <div class="mp-body">
            <span class="mp-error">${escapeHtml(state.message)}</span>
            <div class="mp-actions">
              <button class="mp-btn" data-action="dismiss" type="button">Fermer</button>
            </div>
          </div>`;
        break;
    }
  }

  destroy(): void {
    this.root.removeEventListener('click', this.handleClick);
    this.host.remove();
  }
}
