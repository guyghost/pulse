import { createActor, type AnyStateMachine, type EventFrom, type SnapshotFrom } from 'xstate';

export interface SvelteActor<TMachine extends AnyStateMachine> {
  readonly snapshot: SnapshotFrom<TMachine>;
  send(event: EventFrom<TMachine>): void;
  subscribe(listener: (snapshot: SnapshotFrom<TMachine>) => void): () => void;
  stop(): void;
}

export function createSvelteActor<TMachine extends AnyStateMachine>(
  machine: TMachine,
  options?: Parameters<typeof createActor<TMachine>>[1]
): SvelteActor<TMachine> {
  const actor = createActor(machine, options);
  let snapshot = $state(actor.getSnapshot()) as SnapshotFrom<TMachine>;

  const subscription = actor.subscribe((nextSnapshot) => {
    snapshot = nextSnapshot as SnapshotFrom<TMachine>;
  });

  actor.start();

  return {
    get snapshot() {
      return snapshot;
    },
    send(event) {
      actor.send(event);
    },
    subscribe(listener) {
      const listenerSubscription = actor.subscribe((nextSnapshot) => {
        listener(nextSnapshot as SnapshotFrom<TMachine>);
      });
      return () => listenerSubscription.unsubscribe();
    },
    stop() {
      subscription.unsubscribe();
      actor.stop();
    },
  };
}
