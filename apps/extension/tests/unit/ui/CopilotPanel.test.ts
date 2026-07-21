import { describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';

import type { CopilotStore } from '../../../src/lib/state/copilot.svelte';
import CopilotPanel from '../../../src/ui/organisms/CopilotPanel.svelte';

function button(target: HTMLElement, label: string): HTMLButtonElement {
  const found = [...target.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.replace(/\s+/g, ' ').trim().includes(label)
  );
  expect(found, `button ${label}`).toBeTruthy();
  return found as HTMLButtonElement;
}

function fakeStore(overrides: Record<string, unknown> = {}): CopilotStore {
  const overriddenJob = overrides.job as Record<string, unknown> | null | undefined;
  const job = overriddenJob
    ? {
        sourceSnapshot: {
          inputHash: 'a'.repeat(64),
          payload: {
            mission: { title: 'Mission Svelte' },
            profile: { jobTitle: 'Lead frontend' },
            experienceEvidence: [
              {
                evidenceId: 'exp-1',
                role: 'Lead frontend',
                company: 'Example',
                summary: 'Migration progressive vers Svelte avec une équipe de quatre personnes.',
                skills: ['Svelte'],
              },
            ],
          },
        },
        ...overriddenJob,
      }
    : null;
  return {
    missionId: 'mission-1',
    accessState: 'active',
    entitlement: {
      status: 'active',
      subject: 'user-1',
      issuedAtMs: 1,
      expiresAtMs: 10_000,
      creditsRemaining: 4,
    },
    dossier: null,
    dossierReadState: 'not_found',
    deletionReceipt: null,
    error: null,
    action: null,
    missionFields: ['title', 'description', 'stack', 'displayedTjm'],
    profileFields: ['jobTitle', 'seniority', 'keywords', 'tjmBounds'],
    selectedEvidenceIds: [],
    availableEvidence: [
      {
        id: 'exp-1',
        label: 'Lead frontend · Example',
        excerpt: 'Migration progressive vers Svelte avec une équipe de quatre personnes.',
      },
    ],
    consentConfirmed: true,
    rolloutEnabled: true,
    canDeleteDossier:
      job !== null && ['accepted', 'rejected', 'failed', 'cancelled'].includes(String(job.status)),
    missionFieldOptions: ['title', 'description', 'stack', 'displayedTjm'],
    profileFieldOptions: ['jobTitle', 'seniority', 'keywords', 'tjmBounds'],
    open: vi.fn(async () => undefined),
    close: vi.fn(),
    link: vi.fn(async () => undefined),
    syncEntitlement: vi.fn(async () => true),
    refreshJob: vi.fn(async () => undefined),
    refreshDossier: vi.fn(async () => undefined),
    createJob: vi.fn(async () => undefined),
    cancelJob: vi.fn(async () => undefined),
    reviewJob: vi.fn(async () => undefined),
    deleteDossier: vi.fn(async () => undefined),
    setConsentConfirmed: vi.fn(),
    toggleMissionField: vi.fn(),
    toggleProfileField: vi.fn(),
    toggleEvidence: vi.fn(),
    ...overrides,
    job,
  } as unknown as CopilotStore;
}

describe('CopilotPanel', () => {
  it('renders the fail-closed rollout state without exposing a creation control', async () => {
    const store = fakeStore({ accessState: 'disabled', consentConfirmed: false });
    const target = document.createElement('div');
    const component = mount(CopilotPanel, {
      target,
      props: { missionId: 'mission-1', store, onCopy: vi.fn() },
    });
    await tick();

    expect(target.textContent).toContain('Déploiement fermé');
    expect(target.textContent).toContain('Aucun contenu n’est transmis');
    expect(target.querySelectorAll('button')).toHaveLength(0);
    expect(store.createJob).not.toHaveBeenCalled();

    unmount(component);
  });

  it('keeps confirmed dossier deletion available after rollout withdrawal', async () => {
    const store = fakeStore({
      accessState: 'disabled',
      rolloutEnabled: false,
      job: {
        jobId: 'job-recovery',
        missionId: 'mission-1',
        requestId: '11111111-1111-4111-8111-111111111111',
        kind: 'analysis',
        creditCost: 0,
        selection: { missionFields: ['title'], profileFields: [], evidenceIds: [] },
        status: 'accepted',
        tjmFacts: null,
        result: {
          schemaVersion: 1,
          kind: 'analysis',
          evidenceClaims: [],
          gaps: [],
          risks: [],
          questions: [],
        },
        error: null,
        creditsRemaining: 0,
        createdAtMs: 1,
        updatedAtMs: 2,
      },
    });
    const target = document.createElement('div');
    const component = mount(CopilotPanel, {
      target,
      props: { missionId: 'mission-1', store, onCopy: vi.fn() },
    });
    await tick();

    expect(target.textContent).toContain('Conservé');
    expect(button(target, 'Analyser la mission').disabled).toBe(true);
    button(target, 'Supprimer le dossier Copilot').click();
    await tick();
    button(target, 'Confirmer').click();
    expect(store.deleteDossier).toHaveBeenCalledOnce();

    unmount(component);
  });

  it.each(['queued', 'running', 'review', 'cancelling', 'uncertain'] as const)(
    'does not offer dossier deletion while the job is %s',
    async (status) => {
      const store = fakeStore({
        job: {
          jobId: 'job-active',
          missionId: 'mission-1',
          requestId: '11111111-1111-4111-8111-111111111111',
          kind: 'analysis',
          creditCost: 0,
          selection: { missionFields: ['title'], profileFields: [], evidenceIds: [] },
          status,
          tjmFacts: null,
          result: null,
          error: null,
          creditsRemaining: 4,
          createdAtMs: 1,
          updatedAtMs: 2,
        },
      });
      const target = document.createElement('div');
      const component = mount(CopilotPanel, {
        target,
        props: { missionId: 'mission-1', store, onCopy: vi.fn() },
      });
      await tick();

      expect(
        [...target.querySelectorAll('button')].some((candidate) =>
          candidate.textContent?.includes('Supprimer le dossier Copilot')
        )
      ).toBe(false);

      unmount(component);
    }
  );

  it.each([
    ['deleted', 'confirme la suppression du dossier Copilot distant'],
    ['not-created', 'aucun dossier Copilot distant n’avait été créé'],
    ['retention-confirmed', 'ne confirme pas une suppression complète'],
  ] as const)(
    'renders the durable %s deletion disposition with its date',
    async (disposition, copy) => {
      const store = fakeStore({
        deletionReceipt: {
          version: 1,
          missionId: 'mission-1',
          disposition,
          confirmedAtMs: Date.UTC(2026, 6, 21, 12, 0),
        },
      });
      const target = document.createElement('div');
      const component = mount(CopilotPanel, {
        target,
        props: { missionId: 'mission-1', store, onCopy: vi.fn() },
      });
      await tick();

      expect(target.textContent).toContain('Issue de la demande de suppression');
      expect(target.textContent).toContain(copy);
      expect(target.textContent).toContain('Confirmé le');
      if (disposition === 'retention-confirmed') {
        expect(target.textContent).toContain('durée n’est pas communiquée');
      }

      unmount(component);
    }
  );

  it('keeps creation disabled until explicit consent is confirmed', async () => {
    const withoutConsent = fakeStore({ consentConfirmed: false });
    const firstTarget = document.createElement('div');
    const firstComponent = mount(CopilotPanel, {
      target: firstTarget,
      props: { missionId: 'mission-1', store: withoutConsent, onCopy: vi.fn() },
    });
    await tick();

    expect(button(firstTarget, 'Analyser la mission').disabled).toBe(true);
    const consent = [...firstTarget.querySelectorAll('label')]
      .find((label) => label.textContent?.includes('Je consens'))
      ?.querySelector<HTMLInputElement>('input');
    expect(consent).toBeTruthy();
    if (consent) {
      consent.checked = true;
      consent.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await tick();
    expect(withoutConsent.setConsentConfirmed).toHaveBeenCalledWith(true);
    expect(withoutConsent.createJob).not.toHaveBeenCalled();
    unmount(firstComponent);

    const withConsent = fakeStore({ consentConfirmed: true });
    const secondTarget = document.createElement('div');
    const secondComponent = mount(CopilotPanel, {
      target: secondTarget,
      props: { missionId: 'mission-1', store: withConsent, onCopy: vi.fn() },
    });
    await tick();

    expect(button(secondTarget, 'Analyser la mission').disabled).toBe(false);
    expect(button(secondTarget, 'Préparer un pitch').disabled).toBe(true);
    button(secondTarget, 'Analyser la mission').click();
    expect(withConsent.createJob).toHaveBeenCalledWith('analysis');
    unmount(secondComponent);
  });

  it('shows explicit consent and keeps operation creation separate from local Gemini', async () => {
    const store = fakeStore();
    const target = document.createElement('div');
    const component = mount(CopilotPanel, {
      target,
      props: { missionId: 'mission-1', store, onCopy: vi.fn() },
    });
    await tick();

    expect(target.textContent).toContain('Copilot Premium');
    expect(target.textContent).toContain('transmettre uniquement les champs cochés');
    expect(target.textContent).toContain('repères de marché numériques agrégés');
    expect(target.textContent).toContain('Aucun relevé de mission individuel n’est transmis');
    button(target, 'Analyser la mission').click();
    expect(store.createJob).toHaveBeenCalledWith('analysis');
    expect(target.textContent).not.toContain('Marquer comme préparée');

    unmount(component);
    expect(store.close).toHaveBeenCalledWith('mission-1');
  });

  it('renders approved analysis and multiple persistent drafts from the living dossier', async () => {
    const onCopy = vi.fn();
    const store = fakeStore({
      dossierReadState: 'ok',
      canDeleteDossier: true,
      dossier: {
        missionId: 'mission-1',
        state: 'ready',
        consent: { missionFields: ['title'], profileFields: [], evidenceIds: ['exp-1'] },
        analysis: {
          jobId: 'job-analysis',
          approvedAtMs: Date.UTC(2026, 6, 21, 12, 0),
          result: {
            schemaVersion: 1,
            kind: 'analysis',
            evidenceClaims: [{ text: 'Expérience Svelte confirmée.', evidenceIds: ['exp-1'] }],
            gaps: ['Disponibilité à préciser'],
            risks: [],
            questions: ['Quelle date de démarrage ?'],
          },
        },
        approvedArtifacts: [
          {
            artifactId: 'artifact-pitch',
            jobId: 'job-pitch',
            kind: 'pitch',
            draft: 'Pitch approuvé persistant.',
            approvedAtMs: Date.UTC(2026, 6, 21, 12, 1),
          },
          {
            artifactId: 'artifact-message',
            jobId: 'job-message',
            kind: 'cover-message',
            draft: 'Message approuvé persistant.',
            approvedAtMs: Date.UTC(2026, 6, 21, 12, 2),
          },
        ],
        activeJob: null,
      },
    });
    const target = document.createElement('div');
    const component = mount(CopilotPanel, {
      target,
      props: { missionId: 'mission-1', store, onCopy },
    });
    await tick();

    expect(target.textContent).toContain('Dossier vivant');
    expect(target.textContent).toContain('Analyse approuvée');
    expect(target.textContent).toContain('Expérience Svelte confirmée.');
    expect(target.textContent).toContain('Brouillons approuvés (2)');
    expect(target.textContent).toContain('Pitch approuvé persistant.');
    expect(target.textContent).toContain('Message approuvé persistant.');
    button(target, 'Copier le brouillon approuvé').click();
    expect(onCopy).toHaveBeenCalledWith('Pitch approuvé persistant.');

    unmount(component);
  });

  it('renders deterministic TJM facts separately from the Eve proposal and copies locally', async () => {
    const onCopy = vi.fn();
    const store = fakeStore({
      job: {
        jobId: 'job-1',
        missionId: 'mission-1',
        requestId: '11111111-1111-4111-8111-111111111111',
        kind: 'tjm-coach',
        creditCost: 1,
        selection: {
          missionFields: ['stack', 'displayedTjm'],
          profileFields: ['keywords', 'tjmBounds'],
          evidenceIds: ['exp-1'],
        },
        status: 'review',
        tjmFacts: {
          schemaVersion: 1,
          confidence: 'medium',
          missionDisplayedTjm: 700,
          profileBounds: { min: 600, target: 700, max: 800, currency: 'EUR' },
          market: {
            matchedStacks: ['svelte'],
            recordCount: 2,
            sampleCount: 10,
            min: 600,
            weightedAverage: 720,
            max: 850,
            trend: 'up',
            lastObservedAt: '2026-07-20',
          },
        },
        result: {
          schemaVersion: 1,
          kind: 'tjm-coach',
          evidenceClaims: [{ text: 'Migration Svelte démontrée.', evidenceIds: ['exp-1'] }],
          gaps: [],
          risks: [],
          questions: ['Quelle est votre date de disponibilité ?'],
          draftSegments: [
            {
              text: 'Argumentaire TJM à copier.',
              sourceRefs: [
                {
                  kind: 'tjm-fact',
                  id: 'profile-tjm-bounds',
                  quote: '600 / 700 / 800 EUR',
                },
              ],
            },
          ],
        },
        error: null,
        creditsRemaining: 3,
        createdAtMs: 1,
        updatedAtMs: 2,
      },
    });
    const target = document.createElement('div');
    const component = mount(CopilotPanel, {
      target,
      props: { missionId: 'mission-1', store, onCopy },
    });
    await tick();

    const text = target.textContent ?? '';
    expect(text.indexOf('Repères locaux déterministes')).toBeLessThan(
      text.indexOf('Proposition IA non vérifiée')
    );
    expect(text).toContain('Ces chiffres ne sont pas une recommandation Eve');
    expect(text).toContain('Affirmations IA — sources à vérifier');
    expect(text).toContain('Migration Svelte démontrée.');
    expect(text).toContain('Lead frontend · Example [exp-1]');
    expect(text).not.toContain('Affirmation sans preuve disponible.');
    expect(text).toContain('Questions à clarifier');
    expect(text).toContain('Quelle est votre date de disponibilité ?');
    expect(text).toContain('Fourchette TJM du profil [profile-tjm-bounds]');
    expect(text).toContain('« 600 / 700 / 800 EUR »');
    button(target, 'Copier').click();
    expect(onCopy).toHaveBeenCalledWith('Argumentaire TJM à copier.');
    button(target, 'Conserver').click();
    expect(store.reviewJob).toHaveBeenCalledWith('accept');
    button(target, 'Écarter').click();
    expect(store.reviewJob).toHaveBeenCalledWith('reject');

    unmount(component);
  });

  it('masks and blocks a malicious artifact whose segment cites unavailable evidence', async () => {
    const onCopy = vi.fn();
    const store = fakeStore({
      selectedEvidenceIds: ['exp-1'],
      job: {
        jobId: 'job-malicious',
        missionId: 'mission-1',
        requestId: '11111111-1111-4111-8111-111111111111',
        kind: 'pitch',
        creditCost: 1,
        selection: {
          missionFields: ['title'],
          profileFields: [],
          evidenceIds: ['exp-1'],
        },
        status: 'review',
        tjmFacts: null,
        result: {
          schemaVersion: 1,
          kind: 'pitch',
          evidenceClaims: [],
          gaps: [],
          risks: [],
          questions: [],
          draftSegments: [
            {
              text: 'J’ai dirigé 200 ingénieurs chez une entreprise inconnue.',
              sourceRefs: [{ kind: 'experience', id: 'exp-missing', quote: 'entreprise inconnue' }],
            },
          ],
        },
        error: null,
        creditsRemaining: 3,
        createdAtMs: 1,
        updatedAtMs: 2,
      },
    });
    const target = document.createElement('div');
    const component = mount(CopilotPanel, {
      target,
      props: { missionId: 'mission-1', store, onCopy },
    });
    await tick();

    expect(target.textContent).toContain('Proposition non vérifiée');
    expect(target.textContent).not.toContain('J’ai dirigé 200 ingénieurs');
    expect(
      [...target.querySelectorAll('button')].some((item) => item.textContent === 'Copier')
    ).toBe(false);
    expect(button(target, 'Conserver').disabled).toBe(true);
    expect(button(target, 'Écarter').disabled).toBe(false);
    expect(onCopy).not.toHaveBeenCalled();

    unmount(component);
  });

  it('masks weak or key-shaped source quotes rejected by the shared grounding guard', async () => {
    for (const quote of [':', 'S', 'summary']) {
      const store = fakeStore({
        selectedEvidenceIds: ['exp-1'],
        job: {
          jobId: `job-weak-${quote}`,
          missionId: 'mission-1',
          requestId: '11111111-1111-4111-8111-111111111111',
          kind: 'pitch',
          creditCost: 1,
          selection: {
            missionFields: ['title'],
            profileFields: [],
            evidenceIds: ['exp-1'],
          },
          status: 'review',
          tjmFacts: null,
          result: {
            schemaVersion: 1,
            kind: 'pitch',
            evidenceClaims: [],
            gaps: [],
            risks: [],
            questions: [],
            draftSegments: [
              {
                text: 'Contenu à masquer.',
                sourceRefs: [{ kind: 'experience', id: 'exp-1', quote }],
              },
            ],
          },
          error: null,
          creditsRemaining: 3,
          createdAtMs: 1,
          updatedAtMs: 2,
        },
      });
      const target = document.createElement('div');
      const component = mount(CopilotPanel, {
        target,
        props: { missionId: 'mission-1', store, onCopy: vi.fn() },
      });
      await tick();

      expect(target.textContent).toContain('Proposition non vérifiée');
      expect(target.textContent).not.toContain('Contenu à masquer.');

      unmount(component);
    }
  });

  it('labels invented text as unverified even when it cites a valid source ID', async () => {
    const store = fakeStore({
      selectedEvidenceIds: ['exp-1'],
      job: {
        jobId: 'job-membership-only',
        missionId: 'mission-1',
        requestId: '11111111-1111-4111-8111-111111111111',
        kind: 'pitch',
        creditCost: 1,
        selection: {
          missionFields: ['title'],
          profileFields: [],
          evidenceIds: ['exp-1'],
        },
        status: 'review',
        tjmFacts: null,
        result: {
          schemaVersion: 1,
          kind: 'pitch',
          evidenceClaims: [],
          gaps: [],
          risks: [],
          questions: [],
          draftSegments: [
            {
              text: 'J’ai dirigé 200 ingénieurs.',
              sourceRefs: [{ kind: 'experience', id: 'exp-1', quote: 'Migration progressive' }],
            },
          ],
        },
        error: null,
        creditsRemaining: 3,
        createdAtMs: 1,
        updatedAtMs: 2,
      },
    });
    const target = document.createElement('div');
    const component = mount(CopilotPanel, {
      target,
      props: { missionId: 'mission-1', store, onCopy: vi.fn() },
    });
    await tick();

    expect(target.textContent).toContain('Proposition IA non vérifiée');
    expect(target.textContent).toContain('J’ai dirigé 200 ingénieurs.');
    expect(target.textContent).toContain('Migration progressive');
    expect(target.textContent).not.toContain('Preuves mobilisées');
    expect(target.textContent).not.toContain('Segments ancrés');

    unmount(component);
  });

  it('renders the frozen job source instead of a mutated current profile excerpt', async () => {
    const store = fakeStore({
      availableEvidence: [
        {
          id: 'exp-1',
          label: 'Lead frontend · Example',
          excerpt: 'Profil local modifié après la création.',
        },
      ],
      selectedEvidenceIds: ['exp-1'],
      job: {
        jobId: 'job-frozen-source',
        missionId: 'mission-1',
        requestId: '11111111-1111-4111-8111-111111111111',
        kind: 'pitch',
        creditCost: 1,
        selection: {
          missionFields: ['title'],
          profileFields: [],
          evidenceIds: ['exp-1'],
        },
        sourceSnapshot: {
          inputHash: 'b'.repeat(64),
          payload: {
            mission: { title: 'Mission Svelte initiale' },
            profile: {},
            experienceEvidence: [
              {
                evidenceId: 'exp-1',
                role: 'Lead frontend',
                company: 'Example',
                summary: 'Source figée transmise avant la modification locale.',
                skills: ['Svelte'],
              },
            ],
          },
        },
        status: 'review',
        tjmFacts: null,
        result: {
          schemaVersion: 1,
          kind: 'pitch',
          evidenceClaims: [],
          gaps: [],
          risks: [],
          questions: [],
          draftSegments: [
            {
              text: 'Pitch à relire.',
              sourceRefs: [
                {
                  kind: 'experience',
                  id: 'exp-1',
                  quote: 'Source figée transmise avant la modification locale',
                },
              ],
            },
          ],
        },
        error: null,
        creditsRemaining: 3,
        createdAtMs: 1,
        updatedAtMs: 2,
      },
    });
    const target = document.createElement('div');
    const component = mount(CopilotPanel, {
      target,
      props: { missionId: 'mission-1', store, onCopy: vi.fn() },
    });
    await tick();

    expect(target.textContent).toContain('Source figée transmise avant la modification locale');
    expect(target.textContent).not.toContain('Profil local modifié après la création.');

    unmount(component);
  });

  it('explains operator reconciliation without polling or recreating an uncertain effect', async () => {
    const store = fakeStore({
      job: {
        jobId: 'job-uncertain',
        missionId: 'mission-1',
        requestId: '11111111-1111-4111-8111-111111111111',
        kind: 'pitch',
        creditCost: 1,
        selection: {
          missionFields: ['title'],
          profileFields: [],
          evidenceIds: ['exp-1'],
        },
        status: 'uncertain',
        tjmFacts: null,
        result: null,
        error: null,
        creditsRemaining: 3,
        createdAtMs: 1,
        updatedAtMs: 2,
      },
    });
    const target = document.createElement('div');
    const component = mount(CopilotPanel, {
      target,
      props: { missionId: 'mission-1', store, onCopy: vi.fn() },
    });
    await tick();

    const text = target.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Réconciliation opérateur requise');
    expect(text).toContain('aucun retry ni remboursement aveugle');
    expect(button(target, 'Préparer un pitch').disabled).toBe(true);
    expect(
      [...target.querySelectorAll('button')].some((item) =>
        item.textContent?.includes('Vérifier maintenant')
      )
    ).toBe(false);
    expect(store.refreshJob).not.toHaveBeenCalled();
    expect(store.createJob).not.toHaveBeenCalled();

    unmount(component);
  });
});
