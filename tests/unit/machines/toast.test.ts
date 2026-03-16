import { createActor } from 'xstate';
import { toastMachine, toastEvents } from '../../../src/machines/toast.machine';

describe('toast machine', () => {
  it('starts in idle state with empty toasts', () => {
    const actor = createActor(toastMachine).start();
    expect(actor.getSnapshot().value).toBe('idle');
    expect(actor.getSnapshot().context.toasts).toHaveLength(0);
    expect(actor.getSnapshot().context.nextId).toBe(1);
    actor.stop();
  });

  it('adds a toast with correct context (id, message, type, duration)', () => {
    const actor = createActor(toastMachine).start();
    actor.send({ type: 'ADD', message: 'Test toast', toastType: 'info' });

    const { toasts } = actor.getSnapshot().context;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(1);
    expect(toasts[0].message).toBe('Test toast');
    expect(toasts[0].toastType).toBe('info');
    expect(toasts[0].duration).toBe(4000);
    expect(typeof toasts[0].createdAt).toBe('number');
    actor.stop();
  });

  it('uses default duration of 4000ms', () => {
    const actor = createActor(toastMachine).start();
    actor.send({ type: 'ADD', message: 'Default duration', toastType: 'info' });

    expect(actor.getSnapshot().context.toasts[0].duration).toBe(4000);
    actor.stop();
  });

  it('respects custom duration', () => {
    const actor = createActor(toastMachine).start();
    actor.send({ type: 'ADD', message: 'Custom', toastType: 'info', duration: 8000 });

    expect(actor.getSnapshot().context.toasts[0].duration).toBe(8000);
    actor.stop();
  });

  it('increments nextId correctly', () => {
    const actor = createActor(toastMachine).start();
    actor.send({ type: 'ADD', message: 'First', toastType: 'info' });
    actor.send({ type: 'ADD', message: 'Second', toastType: 'error' });
    actor.send({ type: 'ADD', message: 'Third', toastType: 'success' });

    const { toasts, nextId } = actor.getSnapshot().context;
    expect(toasts[0].id).toBe(1);
    expect(toasts[1].id).toBe(2);
    expect(toasts[2].id).toBe(3);
    expect(nextId).toBe(4);
    actor.stop();
  });

  it('enforces max 5 toasts with FIFO eviction', () => {
    const actor = createActor(toastMachine).start();

    for (let i = 1; i <= 6; i++) {
      actor.send({ type: 'ADD', message: `Toast ${i}`, toastType: 'info' });
    }

    const { toasts } = actor.getSnapshot().context;
    expect(toasts).toHaveLength(5);
    // Oldest (Toast 1) should have been evicted
    expect(toasts[0].message).toBe('Toast 2');
    expect(toasts[4].message).toBe('Toast 6');
    actor.stop();
  });

  it('dismisses a specific toast by ID', () => {
    const actor = createActor(toastMachine).start();
    actor.send({ type: 'ADD', message: 'First', toastType: 'info' });
    actor.send({ type: 'ADD', message: 'Second', toastType: 'error' });

    actor.send({ type: 'DISMISS', id: 1 });

    const { toasts } = actor.getSnapshot().context;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(2);
    expect(toasts[0].message).toBe('Second');
    actor.stop();
  });

  it('dismisses all toasts', () => {
    const actor = createActor(toastMachine).start();
    actor.send({ type: 'ADD', message: 'First', toastType: 'info' });
    actor.send({ type: 'ADD', message: 'Second', toastType: 'error' });
    actor.send({ type: 'ADD', message: 'Third', toastType: 'success' });

    actor.send({ type: 'DISMISS_ALL' });

    expect(actor.getSnapshot().context.toasts).toHaveLength(0);
    actor.stop();
  });

  it('auto-dismisses a toast by ID', () => {
    const actor = createActor(toastMachine).start();
    actor.send({ type: 'ADD', message: 'First', toastType: 'info' });
    actor.send({ type: 'ADD', message: 'Second', toastType: 'error' });

    actor.send({ type: 'AUTO_DISMISS', id: 1 });

    const { toasts } = actor.getSnapshot().context;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(2);
    actor.stop();
  });

  it('adds toast with type info', () => {
    const actor = createActor(toastMachine).start();
    actor.send({ type: 'ADD', message: 'Info toast', toastType: 'info' });
    expect(actor.getSnapshot().context.toasts[0].toastType).toBe('info');
    actor.stop();
  });

  it('adds toast with type error', () => {
    const actor = createActor(toastMachine).start();
    actor.send({ type: 'ADD', message: 'Error toast', toastType: 'error' });
    expect(actor.getSnapshot().context.toasts[0].toastType).toBe('error');
    actor.stop();
  });

  it('adds toast with type success', () => {
    const actor = createActor(toastMachine).start();
    actor.send({ type: 'ADD', message: 'Success toast', toastType: 'success' });
    expect(actor.getSnapshot().context.toasts[0].toastType).toBe('success');
    actor.stop();
  });

  describe('toastEvents helpers', () => {
    it('creates an ADD event with defaults', () => {
      const event = toastEvents.add('Hello');
      expect(event).toEqual({ type: 'ADD', message: 'Hello', toastType: 'info', duration: undefined });
    });

    it('creates a DISMISS event', () => {
      const event = toastEvents.dismiss(42);
      expect(event).toEqual({ type: 'DISMISS', id: 42 });
    });

    it('creates a DISMISS_ALL event', () => {
      const event = toastEvents.dismissAll();
      expect(event).toEqual({ type: 'DISMISS_ALL' });
    });
  });
});
