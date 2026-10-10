import { writeFileSync } from 'node:fs';

interface CdpMessage {
  id?: number;
  method?: string;
  sessionId?: string;
  params?: { sessionId?: string; targetId?: string; reason?: string };
  result?: {
    result?: { value?: unknown };
    data?: string;
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  };
  error?: { message?: string };
}

interface DebugTarget {
  targetId: string;
  type: string;
  url: string;
  attached?: boolean;
}

function messageText(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }
  return String(data);
}

class BrowserCdp {
  readonly #ws: WebSocket;
  #nextId = 1;
  readonly #pending = new Map<number, (message: CdpMessage) => void>();

  constructor(ws: WebSocket) {
    this.#ws = ws;
    ws.addEventListener('message', (event) => {
      let message: CdpMessage;
      try {
        message = JSON.parse(messageText(event.data)) as CdpMessage;
      } catch (error) {
        console.log(
          `CDP message parse failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return;
      }
      if (message.id === undefined) {
        return;
      }
      const resolve = this.#pending.get(message.id);
      if (!resolve) {
        return;
      }
      this.#pending.delete(message.id);
      resolve(message);
    });
  }

  send<T>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = this.#nextId;
    this.#nextId += 1;
    const response = new Promise<CdpMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP ${method} timed out.`));
      }, 30_000);
      this.#pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    this.#ws.send(JSON.stringify(payload));
    return response.then((message) => {
      if (message.error) {
        throw new Error(message.error.message ?? `CDP ${method} failed.`);
      }
      return message.result as T;
    });
  }

  close(): void {
    this.#ws.close();
  }
}

export class PanelDriver {
  readonly #browser: BrowserCdp;
  readonly #sessionId: string;

  constructor(browser: BrowserCdp, sessionId: string) {
    this.#browser = browser;
    this.#sessionId = sessionId;
  }

  send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.#browser.send<T>(method, params, this.#sessionId);
  }

  close(): void {
    this.#browser.close();
  }

  async evaluate<T>(source: string, arg?: unknown): Promise<T> {
    const body = source.trim().startsWith('async ') ? source.trim().slice('async '.length) : source;
    const expression = arg === undefined ? `(${body})()` : `(${body})(${JSON.stringify(arg)})`;
    const result = await this.send<{
      result?: { value?: T };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>('Runtime.evaluate', {
      expression,
      awaitPromise: body.includes('await '),
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      const detail =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'evaluate failed';
      throw new Error(detail);
    }
    return result.result?.value as T;
  }

  async clickNamed(label: string): Promise<void> {
    const clicked = await this.evaluate<boolean>(
      `async (label) => {
        const nodes = [...document.querySelectorAll('button, [role="button"], a, select, input')];
        const node = nodes.find((element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            return false;
          }
          const name = element.getAttribute('aria-label') || element.textContent || '';
          return name.includes(label);
        });
        if (!(node instanceof HTMLElement)) {
          return false;
        }
        node.click();
        return true;
      }`,
      label
    );
    if (!clicked) {
      throw new Error(`Could not click "${label}" in the side panel.`);
    }
  }

  async clickSelector(selector: string): Promise<void> {
    const clicked = await this.evaluate<boolean>(
      `async (selector) => {
        const node = document.querySelector(selector);
        if (!(node instanceof HTMLElement)) {
          return false;
        }
        node.click();
        return true;
      }`,
      selector
    );
    if (!clicked) {
      throw new Error(`Could not click ${selector} in the side panel.`);
    }
  }

  async attribute(selector: string, name: string): Promise<string | null> {
    return this.evaluate<string | null>(
      `async (input) => document.querySelector(input.selector)?.getAttribute(input.name) ?? null`,
      { selector, name }
    );
  }

  async waitForText(text: string, timeoutMs = 20_000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const found = await this.evaluate<boolean>(
        `(needle) => {
          for (const labelled of document.querySelectorAll('[aria-label]')) {
            if (labelled.getAttribute('aria-label')?.includes(needle)) {
              return true;
            }
          }
          const nodes = document.querySelectorAll('h1, h2, h3, p, span, label, button, a, li');
          for (const node of nodes) {
            if (node.childElementCount > 4) {
              continue;
            }
            const value = node.textContent ?? '';
            if (value.length < 180 && value.includes(needle)) {
              return true;
            }
          }
          return false;
        }`,
        text
      );
      if (found) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const snapshot = await this.evaluate<string>(`() => {
      const parts = [];
      for (const node of document.querySelectorAll('h1, h2, h3, button, p')) {
        const value = (node.textContent ?? '').trim().replace(/\\s+/g, ' ');
        if (value && value.length < 90) {
          parts.push(value);
        }
        if (parts.length >= 30) {
          break;
        }
      }
      return parts.join(' | ');
    }`);
    throw new Error(`Timed out waiting for "${text}" in the side panel. Visible: ${snapshot}`);
  }

  async textInView(text: string): Promise<boolean> {
    return this.evaluate<boolean>(
      `async (needle) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          if (node.textContent?.includes(needle)) {
            const parent = node.parentElement;
            if (!parent) {
              return false;
            }
            const rect = parent.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1) {
              return true;
            }
          }
          node = walker.nextNode();
        }
        return false;
      }`,
      text
    );
  }

  async requireTextInView(text: string): Promise<void> {
    if (!(await this.textInView(text))) {
      throw new Error(`"${text}" is not fully visible in the panel viewport.`);
    }
  }

  async requireFieldInView(text: string): Promise<void> {
    const visible = await this.evaluate<boolean>(
      `async (needle) => {
        const nodes = [...document.querySelectorAll('input, select, textarea, label, [aria-label]')];
        return nodes.some((element) => {
          const blob = [
            element.getAttribute('aria-label'),
            element.getAttribute('placeholder'),
            element.textContent,
          ]
            .filter((value) => value)
            .join(' ');
          if (!blob.includes(needle)) {
            return false;
          }
          const rect = element.getBoundingClientRect();
          const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
          return rect.width > 0 && visibleHeight >= 24 && rect.top < window.innerHeight && rect.bottom > 0;
        });
      }`,
      text
    );
    if (!visible) {
      throw new Error(`"${text}" is not fully visible in the panel viewport.`);
    }
  }

  async waitUntilGone(selector: string, timeoutMs = 8_000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const present = await this.evaluate<boolean>(
        `async (selector) => Boolean(document.querySelector(selector))`,
        selector
      );
      if (!present) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`${selector} stayed in the side panel.`);
  }

  async resetScroll(): Promise<void> {
    await this.evaluate<void>(`async () => {
      window.scrollTo(0, 0);
      for (const element of document.querySelectorAll('*')) {
        if (element instanceof HTMLElement && element.scrollTop !== 0) {
          element.scrollTop = 0;
        }
      }
    }`);
  }

  async alignToScrollTop(selector: string): Promise<void> {
    const aligned = await this.evaluate<boolean>(
      `async (target) => {
        const element = document.querySelector(target);
        if (!element) {
          return false;
        }
        let scroller = element.parentElement;
        while (scroller) {
          const style = getComputedStyle(scroller);
          if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) {
            const top = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
            scroller.scrollTop = top;
            return true;
          }
          scroller = scroller.parentElement;
        }
        return false;
      }`,
      selector
    );
    if (!aligned) {
      throw new Error(`Could not align ${selector} to the top of its scroll container.`);
    }
  }

  async pause(): Promise<void> {
    await this.send('Debugger.enable');
    await this.send('Debugger.pause');
  }

  async resume(): Promise<void> {
    await this.send('Debugger.resume').catch(() => undefined);
    await this.send('Debugger.disable').catch(() => undefined);
  }

  async stampExempleBadges(): Promise<number> {
    return this.evaluate<number>(`() => {
      const styleId = 'store-exemple-badge-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = '.score-flow__example-badge{display:inline-flex;align-items:center;padding:4px 12px;border:1px solid #f0efef;border-radius:100px;background:#ffffff;color:#57534d;font-size:0.75rem;font-weight:600;letter-spacing:0.02em;line-height:1.2;}';
        document.head.appendChild(style);
      }
      const badge = () => {
        const node = document.createElement('span');
        node.className = 'score-flow__example-badge';
        node.dataset.storeExemple = 'true';
        node.textContent = 'Exemple';
        return node;
      };
      const stamp = () => {
        let stamped = 0;
        for (const card of document.querySelectorAll('[aria-label^="Mission "]')) {
          if (card.querySelector('[data-store-exemple]')) {
            continue;
          }
          const row = card.querySelector('.flex.flex-wrap');
          if (!row) {
            continue;
          }
          row.prepend(badge());
          stamped += 1;
        }
        const drawer = document.querySelector('[aria-label="Investigation mission"]');
        if (drawer && !drawer.querySelector('[data-store-exemple]')) {
          const row = drawer.querySelector('.mt-3.flex');
          if (row) {
            row.prepend(badge());
            stamped += 1;
          }
        }
        return stamped;
      };
      const root = document.documentElement;
      if (root.dataset.storeExempleObserver !== 'true') {
        root.dataset.storeExempleObserver = 'true';
        let stamping = false;
        const observer = new MutationObserver(() => {
          if (stamping) {
            return;
          }
          stamping = true;
          stamp();
          stamping = false;
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
      return stamp();
    }`);
  }

  async innerWidth(): Promise<number> {
    return this.evaluate<number>(`async () => window.innerWidth`);
  }

  async isDark(): Promise<boolean> {
    return this.evaluate<boolean>(
      `async () => document.documentElement.classList.contains('dark')`
    );
  }

  async devicePixelRatio(): Promise<number> {
    return this.evaluate<number>(`async () => window.devicePixelRatio`);
  }

  async screenshot(path: string): Promise<void> {
    const shot = await this.send<{ data?: string }>('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    if (!shot.data) {
      throw new Error('Side panel screenshot returned no PNG data.');
    }
    writeFileSync(path, Buffer.from(shot.data, 'base64'));
  }
}

async function openBrowserCdp(port: number): Promise<BrowserCdp> {
  const version = (await fetch(`http://127.0.0.1:${port}/json/version`).then((response) =>
    response.json()
  )) as { webSocketDebuggerUrl?: string };
  if (!version.webSocketDebuggerUrl) {
    throw new Error('Chrome did not expose a DevTools websocket.');
  }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DevTools websocket timed out.')), 10_000);
    ws.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
    ws.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('DevTools websocket failed.'));
      },
      { once: true }
    );
  });
  return new BrowserCdp(ws);
}

export async function attachSidePanel(port: number, extensionId: string): Promise<PanelDriver> {
  const browser = await openBrowserCdp(port);
  try {
    const started = Date.now();
    let targetId = '';
    while (!targetId && Date.now() - started < 8_000) {
      const targets = await browser.send<{ targetInfos: DebugTarget[] }>('Target.getTargets');
      const match = targets.targetInfos.find(
        (target) =>
          target.type === 'page' &&
          target.attached === false &&
          target.url.startsWith(`chrome-extension://${extensionId}/`)
      );
      targetId = match?.targetId ?? '';
      if (!targetId) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    if (!targetId) {
      const targets = await browser.send<{ targetInfos: DebugTarget[] }>('Target.getTargets');
      const summary = targets.targetInfos
        .map((target) => `${target.type} ${target.url}`)
        .join(' | ');
      throw new Error(`The docked side panel target was not found. Targets: ${summary}`);
    }
    const attached = await browser.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const driver = new PanelDriver(browser, attached.sessionId);
    await driver.send('Runtime.enable');
    await driver.send('Runtime.runIfWaitingForDebugger');
    await driver.send('Page.enable');
    const probe = await driver.send<{ result?: { value?: unknown } }>('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    });
    if (probe.result?.value !== 'complete') {
      throw new Error(`Side panel readyState is ${String(probe.result?.value)}.`);
    }
    await driver.waitForText('Navigation principale');
    return driver;
  } catch (error) {
    browser.close();
    throw error;
  }
}
