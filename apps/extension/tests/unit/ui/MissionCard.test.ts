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
    publishedAt: '2026-03-14T09:00:00.000Z',
    seniority: 'senior',
    scoreBreakdown: null,
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
    const disclosure = target.querySelector(
      'button[aria-label="Afficher les détails de la mission Developpeur fullstack TypeScript"]'
    ) as HTMLButtonElement;
    disclosure.click();
    await tick();
    expect(target.textContent).toContain('650');
    expect(target.textContent).toMatch(/650.*\/j/);
  });

  it('expose une carte article non interactive avec un nom stable', async () => {
    const target = mountCard();
    await tick();

    const articles = target.querySelectorAll(
      'article[aria-label="Mission Developpeur fullstack TypeScript chez Acme Corp"]'
    );
    expect(articles).toHaveLength(1);
    expect(articles[0].getAttribute('role')).not.toBe('button');
    expect(articles[0].hasAttribute('tabindex')).toBe(false);
  });

  it('contrôle les détails avec un identifiant borné et une région nommée', async () => {
    const target = mountCard({ mission: makeMission({ id: '123/mission très longue' }) });
    await tick();

    const disclosure = target.querySelector(
      'button[aria-label="Afficher les détails de la mission Developpeur fullstack TypeScript"]'
    ) as HTMLButtonElement;
    const detailsId = disclosure.getAttribute('aria-controls') ?? '';

    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(detailsId).toMatch(/^mission-details-[A-Za-z][A-Za-z0-9-]{0,63}$/);
    expect(detailsId.length).toBeGreaterThanOrEqual(17);
    expect(detailsId.length).toBeLessThanOrEqual(80);
    expect(document.querySelectorAll(`#${detailsId}`)).toHaveLength(0);

    disclosure.click();
    await tick();

    expect(disclosure.getAttribute('aria-label')).toBe(
      'Masquer les détails de la mission Developpeur fullstack TypeScript'
    );
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    const region = target.querySelector(`#${detailsId}`);
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('aria-label')).toBe(
      'Détails de la mission Developpeur fullstack TypeScript'
    );
  });

  it('évite les collisions entre identifiants de mission normalisés', async () => {
    const first = mountCard({ mission: makeMission({ id: 'mission/a' }) });
    const second = mountCard({ mission: makeMission({ id: 'mission a' }) });
    await tick();

    const firstId = first
      .querySelector('button[aria-controls^="mission-details-"]')
      ?.getAttribute('aria-controls');
    const secondId = second
      .querySelector('button[aria-controls^="mission-details-"]')
      ?.getAttribute('aria-controls');

    expect(firstId).not.toBe(secondId);
  });

  it('expose le statut courant et les transitions dans un groupe nommé', async () => {
    const onStatusTransition = vi.fn();
    const target = mountCard({ trackingStatus: 'detected', onStatusTransition });
    await tick();

    const group = target.querySelector(
      '[role="group"][aria-label="Statut de la mission Developpeur fullstack TypeScript"]'
    ) as HTMLElement;
    expect(group).not.toBeNull();
    expect(
      group.querySelector('[role="status"][aria-label="Statut actuel : Détectée"]')
    ).not.toBeNull();

    const transition = group.querySelector(
      'button[aria-label="Passer le statut à Sélectionnée"]'
    ) as HTMLButtonElement;
    transition.click();
    expect(onStatusTransition).toHaveBeenCalledWith('selected');
  });

  it('fige les transitions pendant leur confirmation', async () => {
    const target = mountCard({
      trackingStatus: 'detected',
      isStatusTransitionPending: true,
      onStatusTransition: vi.fn(),
    });
    await tick();

    const group = target.querySelector(
      '[role="group"][aria-label="Statut de la mission Developpeur fullstack TypeScript"]'
    ) as HTMLElement;
    expect(group.getAttribute('aria-busy')).toBe('true');
    expect(Array.from(group.querySelectorAll('button')).every((button) => button.disabled)).toBe(
      true
    );
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

  it('affiche "Vu" pour une mission lue dans une file stable', async () => {
    const target = mountCard({ isSeen: true, showSeenStatus: true });
    await tick();

    expect(target.textContent).toContain('Vu');
    expect(target.textContent).not.toContain('Nouveau');
  });

  it('affiche le timestamp du dernier changement de statut', async () => {
    const target = mountCard({
      trackingStatus: 'selected',
      trackingUpdatedAt: Date.UTC(2026, 5, 24, 10, 30),
    });
    await tick();

    expect(target.textContent).toContain('Sélectionnée');
    expect(target.textContent).toContain('Modifié');
  });

  it('appelle onToggleFavorite au clic sur le bouton favoris', async () => {
    const onToggleFavorite = vi.fn();
    const target = mountCard({ onToggleFavorite });
    await tick();

    const favoriteBtn = target.querySelector(
      'button[aria-label="Ajouter la mission aux favoris"]'
    ) as HTMLButtonElement;
    expect(favoriteBtn).not.toBeNull();
    favoriteBtn.click();
    expect(onToggleFavorite).toHaveBeenCalledOnce();
  });

  it("affiche l'etat favori (label accessible change)", async () => {
    const target = mountCard({ isFavorite: true });
    await tick();

    const starredBtn = target.querySelector(
      'button[aria-label="Retirer la mission des favoris"]'
    ) as HTMLButtonElement;
    expect(starredBtn).not.toBeNull();
  });

  it("conserve l'état favori confirmé pendant la persistance", async () => {
    const target = mountCard({ isFavorite: false, isFavoritePending: true });
    await tick();

    const favoriteButton = target.querySelector(
      'button[aria-label="Ajouter la mission aux favoris"]'
    ) as HTMLButtonElement;
    expect(favoriteButton.getAttribute('aria-pressed')).toBe('false');
    expect(favoriteButton.disabled).toBe(true);
  });

  it("affiche l'etat non-favori par defaut", async () => {
    const target = mountCard({ isFavorite: false });
    await tick();

    const unstarredBtn = target.querySelector(
      'button[aria-label="Ajouter la mission aux favoris"]'
    ) as HTMLButtonElement;
    expect(unstarredBtn).not.toBeNull();
    // Pas de bouton "Retirer"
    expect(target.querySelector('button[aria-label="Retirer la mission des favoris"]')).toBeNull();
  });

  it('affiche le score avec la bonne couleur pour score >= 80', async () => {
    const target = mountCard({ mission: makeMission({ score: 85 }) });
    await tick();
    const scoreEl = target.querySelector('.font-mono.font-bold');
    expect(scoreEl).not.toBeNull();
    expect(scoreEl!.textContent).toContain('85');
    expect(scoreEl!.className).toContain('text-text-primary');
    expect(scoreEl!.className).toContain('bg-accent-green/15');
  });

  it('affiche le score avec la bonne couleur pour score entre 50 et 79', async () => {
    const target = mountCard({ mission: makeMission({ score: 65 }) });
    await tick();
    const scoreEl = target.querySelector('.font-mono.font-bold');
    expect(scoreEl).not.toBeNull();
    expect(scoreEl!.textContent).toContain('65');
    expect(scoreEl!.className).toContain('text-text-primary');
    expect(scoreEl!.className).toContain('bg-accent-amber/15');
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

  it('explique le score depuis une disclosure accessible', async () => {
    const target = mountCard({
      mission: makeMission({
        score: 82,
        semanticScore: 76,
        semanticReason: 'Stack TypeScript très proche du profil',
        scoreBreakdown: {
          criteria: {
            stack: 92,
            tjm: 88,
            location: 70,
            remote: 85,
            seniorityBonus: 4,
            startDateBonus: 2,
          },
          deterministic: 84,
          semantic: 76,
          semanticReason: 'Stack TypeScript très proche du profil',
          total: 82,
          grade: 'A',
        },
      }),
    });
    await tick();

    const detailsButton = target.querySelector(
      'button[aria-controls^="mission-score-details-"]'
    ) as HTMLButtonElement;
    expect(detailsButton).not.toBeNull();
    expect(detailsButton.textContent).toContain('Pourquoi ce score ?');
    expect(detailsButton.getAttribute('aria-expanded')).toBe('false');
    expect(target.textContent).not.toContain('Score final 82/100');

    detailsButton.click();
    await tick();

    expect(detailsButton.getAttribute('aria-expanded')).toBe('true');
    expect(target.textContent).toContain('Score final 82/100');
    expect(target.textContent).toContain('Base 84');
    expect(target.textContent).toContain('Compétences');
    expect(target.textContent).toContain('IA sémantique');
    expect(target.textContent).toContain('Stack TypeScript très proche du profil');
  });
});
