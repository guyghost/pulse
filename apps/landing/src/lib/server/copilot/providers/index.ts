import { EveClientTransport } from './eve-client-transport';
import type { EveProviderConfig } from './eve-config';
import { EveCopilotProvider } from './eve-provider';

export { readEveProviderConfig } from './eve-config';
export type { EveProviderConfig, EveProviderDisabledReason } from './eve-config';
export { EveProviderError } from './eve-error';
export type { EveProviderErrorCode } from './eve-error';
export { EveCopilotProvider } from './eve-provider';
export type { EveTransport } from './eve-transport';

export function createEveCopilotProvider(config: EveProviderConfig): EveCopilotProvider {
  if (!config.enabled) {
    return new EveCopilotProvider(config, {
      async run() {
        throw new Error('Disabled Eve transport must not run.');
      },
      async cancel() {
        throw new Error('Disabled Eve transport must not cancel.');
      },
    });
  }

  return new EveCopilotProvider(config, new EveClientTransport(config));
}
