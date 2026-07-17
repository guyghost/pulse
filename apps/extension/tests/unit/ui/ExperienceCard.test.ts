/** @vitest-environment jsdom */
import { mount, tick, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Experience } from '../../../src/lib/core/types/profile';
import { detailsIdLeaseRegistry } from '../../../src/models/cv-experience-card-accessibility.machine';
import ExperienceCard from '../../../src/ui/molecules/ExperienceCard.svelte';
import ExperienceCardHarness from './fixtures/ExperienceCardHarness.svelte';

function experience(overrides: Partial<Experience> = {}): Experience {
  return {
    id: 'exp-1',
    title: 'Technical Lead',
    company: 'Acme',
    employmentType: 'Freelance',
    location: 'Paris',
    startDate: '2023-01',
    endDate: null,
    isCurrent: true,
    description: 'Architecture du produit.',
    skills: ['Svelte', ' TypeScript '],
    source: 'linkedin',
    sourceExternalId: null,
    positionIndex: 0,
    updatedAt: 1,
    ...overrides,
  };
}

describe('ExperienceCard', () => {
  it('displays and edits the employment type', async () => {
    const onSave = vi.fn();
    const value = experience();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ExperienceCard, {
      target,
      props: { experience: value, draft: value, isEditing: true, onSave },
    });

    expect(target.querySelector('[role="article"]')?.getAttribute('aria-label')).toBe(
      'Expérience Technical Lead chez Acme'
    );
    expect(target.querySelector('[aria-expanded]')).toBeNull();
    const input = target.querySelector<HTMLInputElement>('input[name="employmentType"]');
    expect(input?.value).toBe('Freelance');
    input!.value = 'Indépendant';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    target.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await tick();

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ employmentType: 'Indépendant' }));
    await unmount(component);
    target.remove();
  });

  it('routes an invalid raw submit through the machine and focuses the first invalid field', async () => {
    const onSave = vi.fn();
    const draft = experience({ title: '' });
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ExperienceCard, {
      target,
      props: { experience: draft, draft, isEditing: true, onSave },
    });

    const submit = target.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.focus();
    submit.click();
    await tick();
    await tick();

    const title = target.querySelector<HTMLInputElement>('input[data-experience-control="title"]')!;
    expect(onSave).not.toHaveBeenCalled();
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(title);

    await unmount(component);
    target.remove();
  });

  it('reconciles same-ID and different-ID draft replacements without stale form values', async () => {
    const initial = experience();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ExperienceCardHarness, {
      target,
      props: { initialExperience: initial, initialDraft: initial },
    });

    const titleInput = target.querySelector<HTMLInputElement>(
      'input[data-experience-control="title"]'
    )!;
    titleInput.focus();

    const sameId = experience({ title: 'Staff Engineer', company: 'Same ID Company' });
    component.replace(sameId, sameId);
    await tick();

    expect(titleInput.value).toBe('Staff Engineer');
    expect(target.querySelector<HTMLInputElement>('input[placeholder="Acme"]')?.value).toBe(
      'Same ID Company'
    );
    expect(document.activeElement).toBe(titleInput);

    target.querySelector<HTMLInputElement>('input[placeholder="Acme"]')!.focus();

    const differentId = experience({
      id: 'exp-2',
      title: 'Principal Engineer',
      company: 'Different ID Company',
      skills: ['Accessibility'],
    });
    component.replace(differentId, differentId);
    await tick();
    await tick();

    const replacementTitle = target.querySelector<HTMLInputElement>(
      'input[data-experience-control="title"]'
    )!;
    expect(replacementTitle.value).toBe('Principal Engineer');
    expect(target.querySelector<HTMLInputElement>('input[placeholder="Acme"]')?.value).toBe(
      'Different ID Company'
    );
    expect(target.querySelector<HTMLInputElement>('input[placeholder^="React"]')?.value).toBe(
      'Accessibility'
    );
    expect(document.activeElement).toBe(replacementTitle);

    await unmount(component);
    target.remove();
  });

  it('publishes the exact collapsed and expanded A3 relationship', async () => {
    const checkpointExperience = experience({
      title: 'Lead Packaged UI',
      company: 'MissionPulse QA',
      location: 'Lyon',
      startDate: '2025-01',
      description: 'Preuve CV locale dans Chrome MV3.',
      skills: ['Svelte', 'TypeScript', 'Playwright'],
      source: 'manual',
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ExperienceCard, {
      target,
      props: { experience: checkpointExperience },
    });

    const article = target.querySelector<HTMLElement>(
      '[role="article"][aria-label="Expérience Lead Packaged UI chez MissionPulse QA"]'
    );
    expect(article?.tabIndex).toBe(-1);

    const toggle = article?.querySelector<HTMLButtonElement>(
      'button[aria-label="Afficher les détails de l’expérience Lead Packaged UI"]'
    );
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    const detailsId = toggle?.getAttribute('aria-controls');
    expect(detailsId).toMatch(/^cv-experience-details-[A-Za-z][A-Za-z0-9-]{0,63}$/);
    expect(target.querySelector(`#${detailsId}`)).toBeNull();

    toggle?.click();
    await tick();

    expect(toggle?.getAttribute('aria-label')).toBe(
      'Masquer les détails de l’expérience Lead Packaged UI'
    );
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-controls')).toBe(detailsId);
    const region = article?.querySelector<HTMLElement>(
      `[role="region"][aria-label="Détails de l’expérience Lead Packaged UI"]#${detailsId}`
    );
    expect(region).not.toBeNull();
    expect(region?.textContent).toContain('Preuve CV locale dans Chrome MV3.');
    expect(region?.textContent).toContain('Svelte');
    expect(region?.textContent).toContain('TypeScript');
    expect(region?.textContent).toContain('Playwright');

    toggle?.focus();
    toggle?.click();
    await tick();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(target.querySelector(`#${detailsId}`)).toBeNull();
    expect(document.activeElement).toBe(toggle);

    await unmount(component);
    target.remove();
  });

  it('keeps edit and delete separate from the details owner', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ExperienceCard, {
      target,
      props: { experience: experience(), onEdit, onDelete },
    });

    const toggle = target.querySelector<HTMLButtonElement>('button[aria-controls]')!;
    const edit = target.querySelector<HTMLButtonElement>('button[aria-label="Modifier"]')!;
    const remove = target.querySelector<HTMLButtonElement>('button[aria-label="Supprimer"]')!;
    expect(toggle.contains(edit)).toBe(false);
    expect(toggle.contains(remove)).toBe(false);

    edit.click();
    remove.click();
    await tick();

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await unmount(component);
    target.remove();
  });

  it('renders no-details as a noninteractive summary with only available actions', async () => {
    const onEdit = vi.fn();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ExperienceCard, {
      target,
      props: {
        experience: experience({ description: '  ', skills: [' ', '\t'] }),
        onEdit,
      },
    });

    expect(target.querySelector('[role="article"]')).not.toBeNull();
    expect(target.querySelector('[aria-expanded]')).toBeNull();
    expect(target.querySelector('[aria-controls]')).toBeNull();
    expect(target.querySelector('button[aria-label="Modifier"]')).not.toBeNull();
    expect(target.querySelector('button[aria-label="Supprimer"]')).toBeNull();

    target.querySelector<HTMLButtonElement>('button[aria-label="Modifier"]')?.click();
    await tick();
    expect(onEdit).toHaveBeenCalledOnce();

    await unmount(component);
    target.remove();
  });

  it('delegates focused unmount synchronously and releases its details ID lease', async () => {
    const onFocusExitRequest = vi.fn(() => 'cv_heading' as const);
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ExperienceCard, {
      target,
      props: { experience: experience(), onFocusExitRequest },
    });
    await tick();
    const article = target.querySelector<HTMLElement>('[role="article"]')!;
    const detailsId = target
      .querySelector<HTMLButtonElement>('button[aria-controls]')!
      .getAttribute('aria-controls')!;
    article.focus();
    expect(document.activeElement).toBe(article);

    await unmount(component);

    const verifier = {};
    expect(detailsIdLeaseRegistry.reserve(document, detailsId, verifier)).toBe('reserved');
    expect(detailsIdLeaseRegistry.release(document, detailsId, verifier)).toBe('released');
    expect(onFocusExitRequest).toHaveBeenCalledOnce();
    expect(onFocusExitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        experienceId: 'exp-1',
        orderedTargets: [
          'next_experience_article',
          'previous_experience_article',
          'add_experience_button',
          'cv_heading',
        ],
      })
    );
    target.remove();
  });

  it('does not delegate unmount after focus has already left through a null related target', async () => {
    const onFocusExitRequest = vi.fn(() => 'cv_heading' as const);
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(ExperienceCard, {
      target,
      props: { experience: experience(), onFocusExitRequest },
    });
    await tick();
    const article = target.querySelector<HTMLElement>('[role="article"]')!;
    article.focus();
    article.blur();
    expect(document.activeElement).not.toBe(article);

    await unmount(component);

    expect(onFocusExitRequest).not.toHaveBeenCalled();
    target.remove();
  });
});
