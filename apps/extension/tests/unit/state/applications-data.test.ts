import { describe, expect, it, vi } from 'vitest';
import type { Mission } from '../../../src/lib/core/types/mission';
import { createApplicationsDataState } from '../../../src/lib/state/applications-data.svelte';
import { createTrackingStore } from '../../../src/lib/state/tracking.svelte';
const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('../../../src/lib/shell/messaging/bridge', () => ({ sendMessage }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const mission = (id: string) => ({ id }) as Mission;
describe('atomic applications snapshots', () => {
  it('publishes only the latest complete pair and retains it on either read failure', async () => {
    const oldMissions = deferred<Mission[]>();
    const oldTrackings = deferred<unknown>();
    const getMissions = vi
      .fn()
      .mockReturnValueOnce(oldMissions.promise)
      .mockResolvedValue([mission('new')]);
    sendMessage
      .mockReset()
      .mockReturnValueOnce(oldTrackings.promise)
      .mockResolvedValue({ type: 'TRACKINGS_RESULT', payload: [] });
    const state = createApplicationsDataState({ getMissions, createTrackingStore });
    const oldRead = state.refresh();
    expect(state.hasSnapshot).toBe(false);
    await state.refresh();
    const currentStore = state.tracking;
    oldMissions.resolve([mission('old')]);
    oldTrackings.resolve({ type: 'TRACKINGS_RESULT', payload: [] });
    expect(await oldRead).toBe(false);
    expect(state.missions.map((item) => item.id)).toEqual(['new']);
    getMissions.mockRejectedValueOnce(new Error('Missions indisponibles'));
    await state.refresh();
    expect(state.error).toBe('Missions indisponibles');
    expect(state.tracking).toBe(currentStore);
    expect(state.missions[0].id).toBe('new');
    sendMessage.mockRejectedValueOnce(new Error('Suivis indisponibles'));
    await state.refresh();
    expect(state.error).toContain('La confirmation du suivi n’a pas été reçue');
    expect(state.tracking).toBe(currentStore);
    state.dispose();
  });
  it('defers refresh during a mutation and discards reads after disposal', async () => {
    sendMessage.mockReset().mockResolvedValue({ type: 'TRACKINGS_RESULT', payload: [] });
    const getMissions = vi.fn().mockResolvedValue([mission('first')]);
    const state = createApplicationsDataState({ getMissions, createTrackingStore });
    await state.refresh();
    const mutation = deferred<void>();
    const pendingMutation = state.mutate(() => mutation.promise);
    await state.refresh();
    expect(getMissions).toHaveBeenCalledTimes(1);
    mutation.resolve();
    await pendingMutation;
    await vi.waitFor(() => expect(getMissions).toHaveBeenCalledTimes(2));
    const pending = deferred<Mission[]>();
    getMissions.mockReturnValueOnce(pending.promise);
    const read = state.refresh();
    state.dispose();
    pending.resolve([mission('disposed')]);
    expect(await read).toBe(false);
    expect(state.missions[0].id).toBe('first');
  });
});
