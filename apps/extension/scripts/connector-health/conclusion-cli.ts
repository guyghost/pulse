import {
  parseConnectorHealthConclusionInput,
  runConnectorHealthConclusionActor,
} from './conclusion';
import { requireConnectorHealthEnvironment, verifyConnectorHealthRuntime } from './runtime-policy';

async function main(): Promise<void> {
  await verifyConnectorHealthRuntime();
  const environment = process.env;
  const input = parseConnectorHealthConclusionInput({
    CAPTURE_RESULT: requireConnectorHealthEnvironment(environment, 'CAPTURE_RESULT'),
    CAPTURE_TERMINAL: environment.CAPTURE_TERMINAL ?? '',
    ISSUE_RESULT: requireConnectorHealthEnvironment(environment, 'ISSUE_RESULT'),
    ISSUE_TERMINAL: environment.ISSUE_TERMINAL ?? '',
  });
  const result = runConnectorHealthConclusionActor(input, {
    installHandlers: () => {
      const failClosed = (): void => {
        process.exitCode = 1;
      };
      process.once('uncaughtExceptionMonitor', failClosed);
      process.once('unhandledRejection', failClosed);
      process.once('SIGINT', failClosed);
      process.once('SIGTERM', failClosed);
    },
    emitStartedMarker: () => {
      process.stdout.write('CONCLUSION_ACTOR_STARTED\n');
    },
  });
  process.stdout.write(`connector-health conclusion ${result.conclusionTerminal}\n`);
  process.exitCode = result.exitCode;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown conclusion bootstrap error.';
  process.stderr.write(`connector-health conclusion bootstrap failure: ${message}\n`);
  process.exitCode = 1;
});
