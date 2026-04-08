export const isDev = import.meta.env.DEV;

export async function bootstrapDevMode(): Promise<void> {
  if (!isDev) {
    return;
  }

  // Install Chrome stubs if not in extension context
  if (!globalThis.chrome?.runtime?.id) {
    const { installChromeStubs } = await import('./chrome-stubs');
    installChromeStubs();
  }

  // Install bridge logger
  const { installBridgeLogger } = await import('./bridge-logger');
  installBridgeLogger();

  console.log('[Dev] Dev mode active', { isExtensionContext: !!globalThis.chrome?.runtime?.id });
}
