/** @vitest-environment jsdom */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CvExperienceStore } from '../../../src/lib/state/cv-experience.svelte';
import type { FocusExitRequest } from '../../../src/models/cv-experience-card-accessibility.machine';
import ExperienceFeed, {
  focusExperienceExitTarget,
} from '../../../src/ui/organisms/ExperienceFeed.svelte';

const roots: HTMLElement[] = [];

function createRoot(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <h2 tabindex="-1" data-cv-heading>Expériences</h2>
    <button type="button" aria-label="Ajouter une expérience" data-cv-add-experience>Ajouter</button>
    <article tabindex="-1" data-cv-experience-article data-experience-id="exp-3" data-position-index="2"></article>
    <article tabindex="-1" data-cv-experience-article data-experience-id="exp-1" data-position-index="0"></article>
    <article tabindex="-1" data-cv-experience-article data-experience-id="exp-2" data-position-index="1"></article>
  `;
  document.body.appendChild(root);
  roots.push(root);
  return root;
}

function request(): FocusExitRequest {
  return Object.freeze({
    experienceId: 'exp-2',
    positionIndex: 1,
    orderedTargets: Object.freeze([
      'next_experience_article',
      'previous_experience_article',
      'add_experience_button',
      'cv_heading',
    ]),
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    root.remove();
  }
});

describe('ExperienceFeed focus exit port', () => {
  it('publishes the exact fallback add-button accessible name', async () => {
    const newExperience = vi.fn();
    const noop = () => undefined;
    const store = {
      experiences: [],
      feedStatus: 'ready',
      editStatus: 'idle',
      draft: null,
      editingId: null,
      syncStatus: 'idle',
      platformStatuses: new Map(),
      lastSyncedAt: null,
      feedError: null,
      editError: null,
      syncError: null,
      canSync: false,
      isSyncing: false,
      load: noop,
      reload: noop,
      applyProfileUpdate: noop,
      newExperience,
      editExperience: noop,
      cancelEdit: noop,
      saveExperience: noop,
      deleteExperience: noop,
      startSync: noop,
      cancelSync: noop,
    } satisfies CvExperienceStore;
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ExperienceFeed, { target, props: { store } });

    const addButton = target.querySelector<HTMLButtonElement>('[data-cv-add-experience]');
    expect(addButton?.getAttribute('aria-label')).toBe('Ajouter une expérience');
    addButton?.click();
    expect(newExperience).toHaveBeenCalledOnce();

    await unmount(component);
    target.remove();
  });

  it('focuses the exact next, previous, add and heading order', () => {
    const root = createRoot();

    expect(focusExperienceExitTarget(root, request())).toBe('next_experience_article');
    expect((document.activeElement as HTMLElement).dataset.experienceId).toBe('exp-3');

    root.querySelector('[data-experience-id="exp-3"]')?.remove();
    expect(focusExperienceExitTarget(root, request())).toBe('previous_experience_article');
    expect((document.activeElement as HTMLElement).dataset.experienceId).toBe('exp-1');

    root.querySelectorAll('[data-cv-experience-article]').forEach((article) => article.remove());
    expect(focusExperienceExitTarget(root, request())).toBe('add_experience_button');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Ajouter une expérience');

    root.querySelector('[data-cv-add-experience]')?.remove();
    expect(focusExperienceExitTarget(root, request())).toBe('cv_heading');
    expect(document.activeElement?.textContent).toBe('Expériences');
  });

  it('focuses the first persisted experience after the equally positioned add draft', () => {
    const root = createRoot();
    root
      .querySelector('[data-cv-add-experience]')
      ?.insertAdjacentHTML(
        'afterend',
        '<article tabindex="-1" data-cv-experience-article data-experience-id="blank" data-position-index="0"></article>'
      );

    expect(
      focusExperienceExitTarget(
        root,
        Object.freeze({ ...request(), experienceId: 'blank', positionIndex: 0 })
      )
    ).toBe('next_experience_article');
    expect((document.activeElement as HTMLElement).dataset.experienceId).toBe('exp-1');
  });

  it('returns null when no connected target can own focus', () => {
    const root = createRoot();
    root.replaceChildren();
    expect(focusExperienceExitTarget(root, request())).toBeNull();
  });
});
