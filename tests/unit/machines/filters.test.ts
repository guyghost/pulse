import { createActor } from 'xstate';
import { filtersMachine } from '../../../src/machines/filters.machine';

describe('filters machine', () => {
  it('starts in inactive state with empty context', () => {
    const actor = createActor(filtersMachine).start();
    expect(actor.getSnapshot().value).toBe('inactive');
    expect(actor.getSnapshot().context).toEqual({
      stack: [],
      tjmRange: null,
      location: null,
      remote: null,
    });
    actor.stop();
  });

  it('SET_STACK transitions to active', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'SET_STACK', stack: ['React', 'TypeScript'] });
    expect(actor.getSnapshot().value).toBe('active');
    expect(actor.getSnapshot().context.stack).toEqual(['React', 'TypeScript']);
    actor.stop();
  });

  it('TOGGLE_STACK_ITEM adds and removes items', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' });
    expect(actor.getSnapshot().context.stack).toEqual(['React']);

    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'Vue' });
    expect(actor.getSnapshot().context.stack).toEqual(['React', 'Vue']);

    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' });
    expect(actor.getSnapshot().context.stack).toEqual(['Vue']);
    actor.stop();
  });

  it('SET_TJM_RANGE transitions to active', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'SET_TJM_RANGE', min: 500, max: 800 });
    expect(actor.getSnapshot().value).toBe('active');
    expect(actor.getSnapshot().context.tjmRange).toEqual({ min: 500, max: 800 });
    actor.stop();
  });

  it('SET_LOCATION transitions to active', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'SET_LOCATION', location: 'Paris' });
    expect(actor.getSnapshot().value).toBe('active');
    expect(actor.getSnapshot().context.location).toBe('Paris');
    actor.stop();
  });

  it('SET_REMOTE transitions to active', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'SET_REMOTE', remote: 'full' });
    expect(actor.getSnapshot().value).toBe('active');
    expect(actor.getSnapshot().context.remote).toBe('full');
    actor.stop();
  });

  it('CLEAR_ALL resets to inactive', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'SET_STACK', stack: ['React'] });
    actor.send({ type: 'SET_LOCATION', location: 'Lyon' });
    actor.send({ type: 'SET_REMOTE', remote: 'hybrid' });
    expect(actor.getSnapshot().value).toBe('active');

    actor.send({ type: 'CLEAR_ALL' });
    expect(actor.getSnapshot().value).toBe('inactive');
    expect(actor.getSnapshot().context).toEqual({
      stack: [],
      tjmRange: null,
      location: null,
      remote: null,
    });
    actor.stop();
  });

  it('auto-transitions to inactive when last filter removed', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' });
    expect(actor.getSnapshot().value).toBe('active');

    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' });
    expect(actor.getSnapshot().value).toBe('inactive');
    actor.stop();
  });

  it('stays active when some filters remain after removing one', () => {
    const actor = createActor(filtersMachine).start();
    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' });
    actor.send({ type: 'SET_LOCATION', location: 'Paris' });

    actor.send({ type: 'TOGGLE_STACK_ITEM', item: 'React' });
    expect(actor.getSnapshot().value).toBe('active');
    expect(actor.getSnapshot().context.location).toBe('Paris');
    actor.stop();
  });
});
