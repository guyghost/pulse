import { createActor } from 'xstate';
import { onboardingMachine } from '../../../src/machines/onboarding.machine';

describe('onboarding machine', () => {
  it('starts in welcome state', () => {
    const actor = createActor(onboardingMachine).start();
    expect(actor.getSnapshot().value).toBe('welcome');
    actor.stop();
  });

  it('follows happy path: welcome → profile → connectors → firstScan → done', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' });
    expect(actor.getSnapshot().value).toBe('profile');

    actor.send({ type: 'NEXT' });
    expect(actor.getSnapshot().value).toBe('connectors');

    actor.send({ type: 'NEXT' });
    expect(actor.getSnapshot().value).toBe('firstScan');

    actor.send({ type: 'SCAN_DONE' });
    expect(actor.getSnapshot().value).toBe('done');
    expect(actor.getSnapshot().context.scanComplete).toBe(true);
    actor.stop();
  });

  it('navigates back through steps', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });

    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toBe('profile');

    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toBe('welcome');
    actor.stop();
  });

  it('back from firstScan goes to connectors', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });

    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toBe('connectors');
    actor.stop();
  });

  it('SET_PROFILE updates context.profile', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'SET_PROFILE', profile: { jobTitle: 'Dev React', stack: ['React'] } });

    expect(actor.getSnapshot().context.profile).toEqual({
      jobTitle: 'Dev React',
      stack: ['React'],
    });
    actor.stop();
  });

  it('SET_PROFILE merges with existing profile', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'SET_PROFILE', profile: { jobTitle: 'Dev React' } });
    actor.send({ type: 'SET_PROFILE', profile: { stack: ['React', 'TS'] } });

    expect(actor.getSnapshot().context.profile).toEqual({
      jobTitle: 'Dev React',
      stack: ['React', 'TS'],
    });
    actor.stop();
  });

  it('SET_CONNECTORS updates context.enabledConnectors', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'SET_CONNECTORS', connectors: ['free-work', 'malt'] });

    expect(actor.getSnapshot().context.enabledConnectors).toEqual(['free-work', 'malt']);
    actor.stop();
  });

  it('SKIP_SCAN goes directly to done without markScanDone', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'SKIP_SCAN' });

    expect(actor.getSnapshot().value).toBe('done');
    expect(actor.getSnapshot().context.scanComplete).toBe(false);
    actor.stop();
  });

  it('done is a final state', () => {
    const actor = createActor(onboardingMachine).start();
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'NEXT' });
    actor.send({ type: 'SKIP_SCAN' });

    expect(actor.getSnapshot().status).toBe('done');
    actor.stop();
  });
});
