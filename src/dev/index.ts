export const isDev = import.meta.env.DEV;

export async function bootstrapDevMode(): Promise<void> {
  if (!isDev) return;

  // Install Chrome stubs if not in extension context
  if (!globalThis.chrome?.runtime?.id) {
    const { installChromeStubs } = await import('./chrome-stubs');
    installChromeStubs();
  }

  // Install bridge logger
  const { installBridgeLogger } = await import('./bridge-logger');
  installBridgeLogger();

  // Install XState inspector
  try {
    const { createBrowserInspector } = await import('@statelyai/inspect');
    createBrowserInspector({ autoStart: true });
    console.log('[Dev] XState inspector active');
  } catch {
    console.log('[Dev] XState inspector not available (install @statelyai/inspect)');
  }

  console.log('[Dev] Dev mode active', { isExtensionContext: !!globalThis.chrome?.runtime?.id });
}
