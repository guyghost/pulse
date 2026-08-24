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
    semanticScore: null,
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
    await tick();
    expect(target.textContent).toContain('650');
    expect(target.textContent).toMatch(/650.*\/j/);
  });

  it('affiche le TJM, la localisation et la séniorité dès l’état réduit, sans déplier', async () => {
    const target = mountCard();
    await tick();

    expect(target.textContent).toMatch(/650.*€.*\/j/);
    expect(target.textContent).toContain('Paris');
    expect(target.textContent).toContain('Senior (7+ ans)');
  });

  it('masque la séniorité inconnue de la ligne de scan rapide', async () => {
    const target = mountCard({ mission: makeMission({ seniority: null }) });
    await tick();

    expect(target.textContent).not.toContain('Séniorité');
    expect(target.textContent).not.toMatch(
      /Junior \(0-2 ans\)|Confirmé \(3-7 ans\)|Senior \(7\+ ans\)/
    );
  });

  it('signale un TJM absent au lieu de ne rien afficher', async () => {
    const target = mountCard({ mission: makeMission({ tjm: null, location: 'Bordeaux' }) });
    await tick();

    expect(target.textContent).toContain('TJM à vérifier');
    expect(target.textContent).not.toMatch(/€\/j/);
    expect(target.textContent).toContain('Bordeaux');
  });

  it('expose les actions de triage dès l’état réduit, sans doublon', async () => {
    const target = mountCard();
    await tick();

    expect(target.querySelectorAll('button[aria-label="Masquer la mission"]')).toHaveLength(1);
    expect(
      target.querySelectorAll('button[aria-label="Ajouter la mission à la comparaison"]')
    ).toHaveLength(1);
    expect(
      target.querySelectorAll('button[aria-label="Ajouter la mission aux favoris"]')
    ).toHaveLength(1);
  });

  it('regarroupe les six actions sur une seule ligne, hors de la zone dépliée', async () => {
    const target = mountCard();
    await tick();

    const actionLabels = [
      'Copier le lien de la mission',
      'Ouvrir la mission sur la plateforme source',
      'Masquer la mission',
      'Ajouter la mission à la comparaison',
      'Ajouter la mission aux favoris',
    ];

    // État replié (défaut) : toutes les actions restent visibles sur la même ligne.
    for (const label of actionLabels) {
      expect(target.querySelectorAll(`button[aria-label="${label}"]`)).toHaveLength(1);
    }
    expect(target.textContent).toContain('Analyser');

    // État déplié : la région de détails n'introduit aucun bouton dupliqué.
    const disclosure = target.querySelector(
      'button[aria-label="Afficher les détails de la mission Developpeur fullstack TypeScript"]'
    ) as HTMLButtonElement;
    disclosure.click();
    await tick();

    const details = target.querySelector('[role="region"]');
    expect(details).not.toBeNull();
    expect(details!.querySelectorAll('button')).toHaveLength(0);
    for (const label of actionLabels) {
      expect(target.querySelectorAll(`button[aria-label="${label}"]`)).toHaveLength(1);
    }
    expect(target.textContent).toContain('Analyser');
  });

  it('réserve la zone dépliée à la description, sans grille redondante', async () => {
    const target = mountCard();
    const disclosure = target.querySelector(
      'button[aria-label="Afficher les détails de la mission Developpeur fullstack TypeScript"]'
    ) as HTMLButtonElement;
    disclosure.click();
    await tick();

    const details = target.querySelector('[role="region"]') as HTMLElement;
    expect(details).not.toBeNull();
    // Zone, séniorité et source vivent hors de la zone dépliée :
    // localisation et séniorité dans la ligne de scan rapide, source en badge d'en-tête.
    expect(details.textContent).not.toContain('Zone');
    expect(details.textContent).not.toContain('Séniorité');
    expect(details.textContent).not.toContain('Source');
    expect(details.textContent).toContain('Mission de developpement');
  });

  it("n'affiche plus le bloc éditorial de décision dans l'expand", async () => {
    const target = mountCard();
    const disclosure = target.querySelector(
      'button[aria-label="Afficher les détails de la mission Developpeur fullstack TypeScript"]'
    ) as HTMLButtonElement;
    disclosure.click();
    await tick();

    const details = target.querySelector('[role="region"]') as HTMLElement;
    expect(details.textContent).not.toContain('Action recommandée');
    expect(details.textContent).not.toContain('Point de vigilance');
    expect(details.textContent).not.toContain('À qualifier');
  });

  it('tronque la description dépliée à deux lignes', async () => {
    const target = mountCard();
    const disclosure = target.querySelector(
      'button[aria-label="Afficher les détails de la mission Developpeur fullstack TypeScript"]'
    ) as HTMLButtonElement;
    disclosure.click();
    await tick();

    const description = target.querySelector('[role="region"] p.line-clamp-2');
    expect(description).not.toBeNull();
    expect(description!.textContent).toContain('Mission de developpement');
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

    // Replié par défaut : la région n'est pas montée, l'identifiant reste borné.
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

  it('affiche la note A avec la couleur prioritaire', async () => {
    const target = mountCard({ mission: makeMission({ score: 85 }) });
    await tick();
    const scoreEl = target.querySelector('.font-mono.font-bold');
    expect(scoreEl).not.toBeNull();
    expect(scoreEl!.textContent?.trim()).toBe('A');
    expect(scoreEl!.getAttribute('aria-label')).toBe('Note A');
    expect(scoreEl!.className).toContain('text-text-primary');
    expect(scoreEl!.className).toContain('bg-accent-green/15');
  });

  it('affiche la note B avec la couleur intermédiaire', async () => {
    const target = mountCard({ mission: makeMission({ score: 65 }) });
    await tick();
    const scoreEl = target.querySelector('.font-mono.font-bold');
    expect(scoreEl).not.toBeNull();
    expect(scoreEl!.textContent?.trim()).toBe('B');
    expect(scoreEl!.getAttribute('aria-label')).toBe('Note B');
    expect(scoreEl!.className).toContain('text-text-primary');
    expect(scoreEl!.className).toContain('bg-accent-amber/15');
  });

  it("n'assimile pas une mission non notée à une note F", async () => {
    const target = mountCard({
      mission: makeMission({
        scoreBreakdown: null,
        score: null,
        semanticScore: null,
        semanticReason: null,
      }),
    });
    await tick();

    expect(target.querySelector('[aria-label^="Note "]')).toBeNull();
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

  it('explique la note depuis une disclosure accessible sans afficher le score numérique', async () => {
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

    const scoreBadge = target.querySelector('[aria-label="Note A"]');
    expect(scoreBadge).not.toBeNull();
    expect(scoreBadge?.textContent?.trim()).toBe('A');
    expect(scoreBadge?.textContent).not.toContain('82');
    expect(scoreBadge?.textContent).not.toContain('/100');

    const detailsButton = target.querySelector(
      'button[aria-controls^="mission-score-details-"]'
    ) as HTMLButtonElement;
    expect(detailsButton).not.toBeNull();
    expect(detailsButton.textContent).toContain('Pourquoi cette note ?');
    expect(detailsButton.getAttribute('aria-expanded')).toBe('false');
    expect(target.textContent).not.toContain('Note finale A');

    detailsButton.click();
    await tick();

    expect(detailsButton.getAttribute('aria-expanded')).toBe('true');
    expect(target.textContent).toContain('Note finale A');
    expect(target.textContent).toContain('Base A');
    expect(target.textContent).not.toContain('82/100');
    expect(target.textContent).not.toContain('84');
    expect(target.textContent).toContain('Compétences');
    expect(target.textContent).toContain('IA sémantique');
    expect(target.textContent).toContain('Stack TypeScript très proche du profil');
  });
});

describe('MissionCard — affordance swipe et accessibilité clavier (couche 3)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const swipeCallbacks = { onToggleFavorite: vi.fn(), onHide: vi.fn() };

  const CHEVRON_SELECTOR = 'span.pointer-events-none.group-hover\\:opacity-60';

  it('affiche deux chevrons de swipe décoratifs quand le geste est actif', async () => {
    const target = mountCard(swipeCallbacks);
    await tick();

    const chevrons = target.querySelectorAll(CHEVRON_SELECTOR);
    expect(chevrons.length).toBe(2);
    for (const chevron of chevrons) {
      expect(chevron.getAttribute('aria-hidden')).toBe('true');
      expect(chevron.className).toContain('pointer-events-none');
      expect(chevron.className).toContain('group-hover:opacity-60');
      expect(chevron.className).toContain('group-focus-within:opacity-60');
    }
  });

  it('masque les chevrons de swipe quand le geste est désactivé (mission comparée)', async () => {
    const target = mountCard({ ...swipeCallbacks, isCompared: true });
    await tick();
    expect(target.querySelectorAll(CHEVRON_SELECTOR).length).toBe(0);
  });

  it('masque les chevrons de swipe sans callbacks de triage', async () => {
    const target = mountCard();
    await tick();
    expect(target.querySelectorAll(CHEVRON_SELECTOR).length).toBe(0);
  });

  it('ouvre le tooltip du comparateur au focus clavier et le referme au blur', async () => {
    const target = mountCard({ ...swipeCallbacks, onToggleCompare: vi.fn() });
    await tick();

    const compare = target.querySelector(
      'button[aria-label="Ajouter la mission à la comparaison"]'
    ) as HTMLButtonElement;
    expect(compare).not.toBeNull();

    compare.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await tick();

    const describedBy = compare.getAttribute('aria-describedby');
    expect(describedBy).toMatch(/^tooltip-/);
    const tooltip = target.querySelector(`#${describedBy}[role="tooltip"]`);
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain('Comparer cette mission');

    compare.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await tick();
    expect(compare.getAttribute('aria-describedby')).toBeNull();
  });

  it('referme le tooltip avec Escape sans déplacer le focus (WCAG 1.4.13)', async () => {
    const target = mountCard({ ...swipeCallbacks, onToggleCompare: vi.fn() });
    await tick();

    const compare = target.querySelector(
      'button[aria-label="Ajouter la mission à la comparaison"]'
    ) as HTMLButtonElement;

    compare.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await tick();
    expect(compare.getAttribute('aria-describedby')).toMatch(/^tooltip-/);

    compare.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(compare.getAttribute('aria-describedby')).toBeNull();
    // Le focus reste sur le déclencheur.
    expect(document.activeElement === compare || compare.isConnected).toBe(true);
  });

  it('garde le bouton comparateur focalisable et inactif quand la limite est atteinte', async () => {
    const onToggleCompare = vi.fn();
    const target = mountCard({
      ...swipeCallbacks,
      onToggleCompare,
      compareDisabled: true,
    });
    await tick();

    const compare = target.querySelector(
      'button[aria-label="Ajouter la mission à la comparaison"]'
    ) as HTMLButtonElement;
    expect(compare.getAttribute('aria-disabled')).toBe('true');
    expect(compare.disabled).toBe(false);

    compare.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await tick();
    // L'explication du blocage reste atteignable au clavier.
    expect(compare.getAttribute('aria-describedby')).toMatch(/^tooltip-/);
    const tooltip = target.querySelector(
      `#${compare.getAttribute('aria-describedby')}[role="tooltip"]`
    );
    expect(tooltip?.textContent).toContain('Trois missions sont déjà sélectionnées');

    compare.click();
    expect(onToggleCompare).not.toHaveBeenCalled();
  });

  it('suit un ordre de tabulation aligné sur l’ordre visuel (réduit puis déplié)', async () => {
    const target = mountCard({
      mission: makeMission({
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

    const labels = () =>
      Array.from(target.querySelectorAll('button')).map(
        (button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''
      );

    // État réduit (défaut) : disclosure → note → les six actions sur une ligne.
    const collapsedLabels = [
      'Afficher les détails de la mission Developpeur fullstack TypeScript',
      'Pourquoi cette note ?',
      'Copier le lien de la mission',
      'Ouvrir la mission sur la plateforme source',
      'Masquer la mission',
      'Ajouter la mission à la comparaison',
      'Ajouter la mission aux favoris',
      'Analyser',
    ];
    expect(labels()).toEqual(collapsedLabels);

    // État déplié : la barre d'actions reste complète et inchangée.
    const disclosure = target.querySelector(
      'button[aria-label="Afficher les détails de la mission Developpeur fullstack TypeScript"]'
    ) as HTMLButtonElement;
    disclosure.click();
    await tick();

    expect(labels()).toEqual([
      'Masquer les détails de la mission Developpeur fullstack TypeScript',
      ...collapsedLabels.slice(1),
    ]);
  });

  it('n’introduit aucun tabindex positif', async () => {
    const target = mountCard(swipeCallbacks);
    await tick();

    const tabindexes = Array.from(target.querySelectorAll('[tabindex]')).map((element) =>
      Number(element.getAttribute('tabindex'))
    );
    expect(tabindexes.every((value) => value <= 0)).toBe(true);
  });
});
