/** @vitest-environment jsdom */
import { mount, tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import ExperienceCard from '../../../src/ui/molecules/ExperienceCard.svelte';

describe('ExperienceCard', () => {
  it('displays and edits the employment type', async () => {
    const onSave = vi.fn();
    const experience = {
      id: 'exp-1',
      title: 'Technical Lead',
      company: 'Acme',
      employmentType: 'Freelance',
      location: 'Paris',
      startDate: '2023-01',
      endDate: null,
      isCurrent: true,
      description: '',
      skills: [],
      source: 'linkedin' as const,
      sourceExternalId: null,
      positionIndex: 0,
      updatedAt: 1,
    };
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(ExperienceCard, {
      target,
      props: { experience, draft: experience, isEditing: true, onSave },
    });

    const input = target.querySelector<HTMLInputElement>('input[name="employmentType"]');
    expect(input?.value).toBe('Freelance');
    input!.value = 'Indépendant';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    target.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await tick();

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ employmentType: 'Indépendant' }));
  });

  it('shows the employment type on a collapsed card', () => {
    const displayExperience = {
      id: 'exp-2',
      title: 'Technical Lead',
      company: 'Acme',
      employmentType: 'Freelance',
      location: 'Paris',
      startDate: '2023-01',
      endDate: null,
      isCurrent: true,
      description: '',
      skills: [],
      source: 'linkedin' as const,
      sourceExternalId: null,
      positionIndex: 0,
      updatedAt: 1,
    };
    const target = document.createElement('div');
    document.body.appendChild(target);
    mount(ExperienceCard, { target, props: { experience: displayExperience } });

    expect(target.textContent).toContain('Freelance');
  });
});
