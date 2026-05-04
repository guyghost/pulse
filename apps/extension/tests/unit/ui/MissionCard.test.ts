import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, tick } from 'svelte';
import MissionCard from '../../../src/ui/molecules/MissionCard.svelte';
import type { Mission } from '$lib/core/types/mission';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Developpeur fullstack TypeScript',
    client: 'Acme Corp',
    description: 'Mission de developpement fullstack avec React et Node.js',
    stack: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
    tjm: 650,
    location: 'Paris',
    remote: 'hybrid',
    duration: '6 mois',
    url: 'https://example.com/mission-1',
    source: 'free-work',
    scrapedAt: new Date('2026-03-15'),
    score: 85,
    semanticScore: 72,
    semanticReason: 'Stack correspondant',
    ...overrides,
  };
}

function mountCard(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(MissionCard, {
    target,
    props: { mission: makeMission(), ...props },
  });
  return target;
}

describe('MissionCard', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('affiche le titre de la mission', async () => {
    const target = mountCard();
    await tick();
    expect(target.textContent).toContain('Developpeur fullstack TypeScript');
  });

  it('affiche les tags de stack (max 3 visibles)', async () => {
    const target = mountCard();
    await tick();
    expect(target.textContent).toContain('TypeScript');
    expect(target.textContent).toContain('React');
    expect(target.textContent).toContain('Node.js');
    // Le 4e tag est masque, remplace par "+1"
    expect(target.textContent).toContain('+1');
    expect(target.textContent).not.toContain('PostgreSQL');
  });

  it('affiche le TJM quand il est present', async () => {
    const target = mountCard();
    // Expand the card to reveal TJM details
    const card = target.querySelector('[role="button"]') as HTMLElement;
    card?.click();
    await tick();
    expect(target.textContent).toContain('650');
    expect(target.textContent).toMatch(/650.*\/j/);
  });

  it("n'affiche pas le TJM quand il est null", async () => {
    const target = mountCard({ mission: makeMission({ tjm: null }) });
    await tick();
    expect(target.textContent).not.toMatch(/€\/j/);
  });

  it('affiche l\'indicateur "Nouveau" pour les missions non vues', async () => {
    const target = mountCard({ isSeen: false });
    await tick();
    expect(target.textContent).toContain('Nouveau');
  });

  it('n\'affiche pas "Nouveau" pour les missions deja vues', async () => {
    const target = mountCard({ isSeen: true });
    await tick();
    expect(target.textContent).not.toContain('Nouveau');
  });

  it('appelle onToggleFavorite au clic sur le bouton favoris', async () => {
    const onToggleFavorite = vi.fn();
    const target = mountCard({ onToggleFavorite });
    await tick();

    const favoriteBtn = target.querySelector(
      'button[title="Ajouter aux favoris"]'
    ) as HTMLButtonElement;
    expect(favoriteBtn).not.toBeNull();
    favoriteBtn.click();
    expect(onToggleFavorite).toHaveBeenCalledOnce();
  });

  it("affiche l'etat favori (titre change)", async () => {
    const target = mountCard({ isFavorite: true });
    await tick();

    const starredBtn = target.querySelector(
      'button[title="Retirer des favoris"]'
    ) as HTMLButtonElement;
    expect(starredBtn).not.toBeNull();
  });

  it("affiche l'etat non-favori par defaut", async () => {
    const target = mountCard({ isFavorite: false });
    await tick();

    const unstarredBtn = target.querySelector(
      'button[title="Ajouter aux favoris"]'
    ) as HTMLButtonElement;
    expect(unstarredBtn).not.toBeNull();
    // Pas de bouton "Retirer"
    expect(target.querySelector('button[title="Retirer des favoris"]')).toBeNull();
  });

  it('affiche le score avec la bonne couleur pour score >= 80', async () => {
    const target = mountCard({ mission: makeMission({ score: 85 }) });
    await tick();
    const scoreEl = target.querySelector('.font-mono.font-semibold');
    expect(scoreEl).not.toBeNull();
    expect(scoreEl!.textContent).toContain('85');
    expect(scoreEl!.className).toContain('text-accent-green');
  });

  it('affiche le score avec la bonne couleur pour score entre 50 et 79', async () => {
    const target = mountCard({ mission: makeMission({ score: 65 }) });
    await tick();
    const scoreEl = target.querySelector('.font-mono.font-semibold');
    expect(scoreEl).not.toBeNull();
    expect(scoreEl!.textContent).toContain('65');
    expect(scoreEl!.className).toContain('text-accent-amber');
  });

  it('affiche le client quand il est present', async () => {
    const target = mountCard();
    await tick();
    expect(target.textContent).toContain('Acme Corp');
  });

  it('affiche la source en badge', async () => {
    const target = mountCard();
    await tick();
    expect(target.textContent).toContain('free-work');
  });
});
