import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { listFiles } from '../helpers/files';

function listSvelteUiFiles(): string[] {
  return listFiles(['src/ui', 'src/sidepanel'], { extensions: ['.svelte'] });
}

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

describe('operational UI constraints', () => {
  it('does not use default table markup for operational screens', () => {
    const violations: string[] = [];

    for (const file of listSvelteUiFiles()) {
      const source = readFileSync(file, 'utf8');
      const tablePattern = /<(table|thead|tbody|tfoot|tr|th|td)\b/g;
      let match: RegExpExecArray | null;

      while ((match = tablePattern.exec(source))) {
        violations.push(`${file}:${lineForOffset(source, match.index)} <${match[1]}>`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('uses design tokens instead of raw numeric Tailwind palette colors', () => {
    const rawPalettePattern =
      /\b(?:bg|text|border|ring|from|via|to|decoration|outline)-(?:red|green|blue|yellow|orange|purple|violet|slate|gray|zinc|stone|amber|emerald|sky|cyan|pink|rose|indigo)-\d{2,3}\b/g;
    const violations: string[] = [];

    for (const file of listSvelteUiFiles()) {
      const source = readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;

      while ((match = rawPalettePattern.exec(source))) {
        violations.push(`${file}:${lineForOffset(source, match.index)} ${match[0]}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps contextual offline notices on primary operational pages', () => {
    const requiredPages = [
      'src/ui/pages/FeedPage.svelte',
      'src/ui/pages/ProfilePage.svelte',
      'src/ui/pages/CvPage.svelte',
      'src/ui/pages/ApplicationsPage.svelte',
      'src/ui/pages/TJMPage.svelte',
      'src/ui/pages/SettingsPage.svelte',
    ];
    const violations: string[] = [];

    for (const file of requiredPages) {
      const source = readFileSync(file, 'utf8');
      const hasOfflineState =
        source.includes('OfflineNotice') ||
        source.includes('Mode hors ligne') ||
        source.includes('Hors ligne');

      if (!hasOfflineState) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps loading states tied to source and progression context', () => {
    const cvSource = readFileSync('src/ui/pages/CvPage.svelte', 'utf8');
    const applicationsSource = readFileSync('src/ui/pages/ApplicationsPage.svelte', 'utf8');

    expect(cvSource).toContain('type LoadingProgressStep');
    expect(cvSource).toContain('Chargement CV');
    expect(cvSource).toContain('Progression du chargement CV');
    expect(cvSource).toContain('Profil canonique');
    expect(cvSource).toContain('Plateformes');
    expect(cvSource).toContain('Écarts');
    expect(cvSource).toContain('role="status"');
    expect(applicationsSource).toContain('type LoadingProgressStep');
    expect(applicationsSource).toContain('Chargement candidatures');
    expect(applicationsSource).toContain('Progression du chargement candidatures');
    expect(applicationsSource).toContain('Missions locales');
    expect(applicationsSource).toContain('Statuts de suivi');
    expect(applicationsSource).toContain('Kits générés');
    expect(applicationsSource).toContain('role="status"');
  });

  it('does not auto-open the feed tour over actionable operational state', () => {
    const source = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');

    expect(source).not.toContain('shouldAutoOpenTour');
    expect(source).not.toContain('getFeedTourSeen()');
    expect(source).toContain("window.addEventListener('feed-tour:open'");
  });

  it('keeps feed offers reachable with one scroll container', () => {
    const feedSource = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');
    const appSource = readFileSync('src/sidepanel/App.svelte', 'utf8');

    expect(feedSource).toContain('class="relative h-full overflow-y-auto"');
    expect(feedSource).toContain('data-testid="feed-scroll-container"');
    expect(feedSource).toContain('data-testid="mission-feed"');
    expect(feedSource).toContain('class="px-4 pb-28 pt-4 focus:outline-none"');
    expect(feedSource).not.toContain('class="flex-1 overflow-y-auto px-4 pb-5 pt-4"');
    expect(appSource).toContain('class="absolute inset-0 overflow-hidden"');
    expect(appSource).not.toContain(
      'class="absolute inset-0 overflow-y-auto"\n        class:hidden={nav.currentPage !=='
    );
    expect(appSource).toContain(
      "feedNavCompact = nav.currentPage === 'feed' && detail.scrollTop > 12"
    );
    expect(appSource).not.toContain('detail.isScrolling && detail.scrollTop > 12');
  });

  it('keeps extension keyboard focus visible and respects reduced motion', () => {
    const source = readFileSync('src/ui/design-tokens.css', 'utf8');

    expect(source).toContain('a:focus-visible');
    expect(source).toContain('button:focus-visible');
    expect(source).toContain('input:focus-visible');
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).toContain('transition-duration: 0.01ms !important');
    expect(source).toContain('animation-iteration-count: 1 !important');
  });

  it('guides users from the feed summary to missions below the fold', () => {
    const source = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');

    expect(source).toContain('data-testid="mission-scroll-cue"');
    expect(source).toContain('data-testid="mission-feed-anchor"');
    expect(source).toContain('function scrollToMissionFeed()');
    expect(source).toContain(
      "missionFeedSection.scrollIntoView({ behavior: 'smooth', block: 'start' })"
    );
    expect(source).toContain('Missions proposées plus bas');
    expect(source).toContain('Missions proposées');
    expect(source).toContain('Voir les ${formatStoryMissionCount(newCount)} nouvelles');
    expect(source).toContain('visibleFeedMissionLabel');
    expect(source).toContain('missionFeedReached = sectionRect.top <= containerRect.bottom - 48');
  });

  it('keeps the primary navigation labels localized for the French product surface', () => {
    const source = readFileSync('src/lib/state/app-navigation.svelte.ts', 'utf8');

    expect(source).toContain("label: 'Réglages'");
    expect(source).not.toContain("label: 'Settings'");
  });

  it('keeps premium destinations visible with an explanatory locked state', () => {
    const source = readFileSync('src/sidepanel/App.svelte', 'utf8');

    expect(source).toContain('const PREMIUM_LOCKS');
    expect(source).toContain('Premium verrouillé');
    expect(source).toContain('aria-label={itemLocked');
    expect(source).toContain('primaryActionLabel="Voir les réglages"');
    expect(source).toContain('data-testid="page-profile"');
    expect(source).toContain("nav.currentPage !== 'profile'");
    expect(source).not.toContain('Profil premium verrouillé');
    expect(source).not.toContain("nav.currentPage === 'profile' && premium.isPremium");
    expect(source).not.toContain('NAV_ITEMS.filter');
    expect(source).not.toContain('Premium pages hidden');
  });

  it('gates premium surfaces through the premium feature flag', () => {
    const appSource = readFileSync('src/sidepanel/App.svelte', 'utf8');
    const settingsSource = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');

    // The pure decision + feature store are wired into the UI gating.
    expect(appSource).toContain("from '$lib/core/features/flags'");
    expect(appSource).toContain('canAccessPremium');
    expect(appSource).toContain('features.premiumFeatureActive');
    // Page rendering consults the combined access decision, not raw isPremium.
    expect(appSource).toContain('TJMPage && premiumAccessible');
    expect(appSource).toContain('CvPage && premiumAccessible');
    expect(appSource).toContain('ApplicationsPage && premiumAccessible');
    // Settings reflects the dormant vs active state.
    expect(settingsSource).toContain('features.premiumFeatureActive');
    expect(settingsSource).toContain('Premium désactivé');
  });

  it('keeps onboarding focused with duration and minimal shell navigation', () => {
    const appSource = readFileSync('src/sidepanel/App.svelte', 'utf8');
    const wizardSource = readFileSync('src/ui/organisms/OnboardingWizard.svelte', 'utf8');

    expect(appSource).toContain("nav.currentPage !== 'onboarding'");
    expect(wizardSource).toContain('2 minutes');
    expect(wizardSource).toContain('Modifiable ensuite');
    expect(wizardSource).toContain('aria-label="Passer l’onboarding"');
    expect(wizardSource).toContain('onclick={onSkip}');
  });

  it('keeps Settings system actions aligned with the stated operational issue', () => {
    const source = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');

    expect(source).toContain("primaryActionLabel: 'Voir les réglages IA'");
    expect(source).toContain("primaryActionLabel: 'Ouvrir l’aide IA Chrome'");
    expect(source).not.toContain("primaryActionLabel: 'Rejouer le tour'");
    expect(source).not.toContain("primaryActionLabel: 'Rejouer l’onboarding'");
  });

  it('groups Settings controls by operational outcome', () => {
    const source = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');

    expect(source).toContain('const settingsSections');
    expect(source).toContain('aria-label="Sections de réglages"');
    expect(source).toContain('id="settings-sources"');
    expect(source).toContain('id="settings-alerts"');
    expect(source).toContain('id="settings-account"');
    expect(source).toContain('id="settings-data"');
    expect(source).toContain('function scrollToSettingsSection');
  });

  it('exposes scan frequency, latest trigger, and recent history in Settings', () => {
    const settingsSource = readFileSync('src/lib/state/settings-page.svelte.ts', 'utf8');
    const scanSource = readFileSync('src/ui/organisms/ScanSettings.svelte', 'utf8');
    const pageSource = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');

    expect(settingsSource).toContain('async loadScanHistory()');
    expect(settingsSource).toContain('getConnectorStatuses()');
    expect(settingsSource).toContain('Dernier déclenchement');
    expect(settingsSource).toContain('Prochain scan dès que Chrome déclenche l’alarme');
    expect(scanSource).toContain('aria-label="Historique et cadence des scans"');
    expect(scanSource).toContain('Historique récent');
    expect(scanSource).toContain('Prochain déclenchement');
    expect(pageSource).toContain('lastScanLabel={settings.lastScanLabel}');
  });

  it('keeps alert history visible next to notification volume controls', () => {
    const settingsSource = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');
    const alertSource = readFileSync('src/ui/molecules/AlertBuilderCard.svelte', 'utf8');

    expect(settingsSource).toContain('getAlertHistory');
    expect(settingsSource).toContain('history={alertHistory}');
    expect(alertSource).toContain('Historique récent');
    expect(alertSource).toContain('Derniers lots réellement envoyés par Chrome.');
    expect(alertSource).toContain('formatAlertHistoryCriteria');
  });

  it('keeps alert preference edits undoable', () => {
    const source = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');

    expect(source).toContain('showToastAction');
    expect(source).toContain('previousPreferences');
    expect(source).toContain('Alerte prioritaire mise à jour');
    expect(source).toContain("label: 'Annuler'");
    expect(source).toContain('Alerte prioritaire restaurée');
  });

  it('keeps alert notifications temporarily pausable', () => {
    const source = readFileSync('src/ui/molecules/AlertBuilderCard.svelte', 'utf8');

    expect(source).toContain('Pause temporaire');
    expect(source).toContain('pauseAlerts(24)');
    expect(source).toContain('mutedUntil: isMuteActive ? mutedUntil : null');
  });

  it('keeps local AI scoring transparent about data usage', () => {
    const source = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');

    expect(source).toContain('type AiTransparencyItem');
    expect(source).toContain("label: 'Mission'");
    expect(source).toContain('Titre, description, stack, TJM, localisation et remote');
    expect(source).toContain("label: 'Profil'");
    expect(source).toContain('Stack cible, TJM cible, remote, localisation et mots-clés');
    expect(source).toContain('Scores conservés 7 jours, vidés quand le profil change');
    expect(source).toContain(
      'Sessions, cookies, identifiants et pages privées ne sont pas envoyés'
    );
    expect(source).toContain("Données utilisées par l'IA locale");
  });

  it('presents Markdown export as a shareable shortlist report', () => {
    const settingsSource = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');
    const exportSource = readFileSync('src/lib/core/export/mission-export.ts', 'utf8');

    expect(settingsSource).toContain('Rapport shortlist');
    expect(settingsSource).toContain('rappel de confidentialité locale');
    expect(settingsSource).toContain("primaryActionLabel: 'Exporter le rapport'");
    expect(settingsSource).toContain("primaryActionIcon: 'file-text'");
    expect(settingsSource).toContain("await handleExportFavorites('markdown')");
    expect(settingsSource).toContain('Export prêt à partager');
    expect(settingsSource).toContain('settings.lastExportSummary');
    expect(settingsSource).toContain('Formats secondaires');
    expect(settingsSource).toContain('Markdown');
    expect(settingsSource).not.toContain("primaryActionLabel: 'Exporter en JSON'");
    expect(readFileSync('src/lib/state/settings-page.svelte.ts', 'utf8')).toContain(
      'sessions plateforme conservées localement'
    );
    expect(exportSource).toContain('## Synthèse shortlist');
    expect(exportSource).toContain('## Missions retenues');
    expect(exportSource).toContain('**Confidentialité:** rapport local généré depuis vos favoris');
  });

  it('keeps Profile story CTAs aligned with edit/save state', () => {
    const source = readFileSync('src/ui/pages/ProfilePage.svelte', 'utf8');

    expect(source).toContain('primaryActionLabel: settings.isSavingProfile');
    expect(source).toContain("? 'Sauvegarde...'");
    expect(source).toContain("? 'Enregistrer'");
    expect(source).toContain(": 'Modifier le profil'");
    expect(source).toContain('if (settings.isSavingProfile)');
    expect(source).not.toContain("primaryActionLabel: 'Enregistrer le profil'");
  });

  it('keeps Profile completion prioritized by scoring impact', () => {
    const profileSource = readFileSync('src/ui/pages/ProfilePage.svelte', 'utf8');
    const impactSource = readFileSync('src/lib/core/profile/profile-impact.ts', 'utf8');

    expect(impactSource).toContain("id: 'stack'");
    expect(impactSource).toContain("id: 'tjm-min'");
    expect(impactSource).toContain("id: 'remote'");
    expect(impactSource).toContain("id: 'location'");
    expect(impactSource).toContain("id: 'search-keywords'");
    expect(impactSource.indexOf("id: 'stack'")).toBeLessThan(impactSource.indexOf("id: 'remote'"));
    expect(profileSource).toContain('buildProfileImpactItems');
    expect(profileSource).toContain('buildProfileImpactSimulation');
    expect(profileSource).toContain('Priorités d’impact');
    expect(profileSource).toContain('topProfilePriorities');
    expect(profileSource).toContain('profileImpactSimulation.delta');
    expect(profileSource).toContain('onclick={openProfileEditing}');
  });

  it('routes the offline TJM story toward cached signal investigation', () => {
    const source = readFileSync('src/ui/pages/TJMPage.svelte', 'utf8');

    expect(source).toContain("statusLabel: 'Cache local'");
    expect(source).toContain("primaryActionLabel: 'Inspecter les signaux locaux'");
    expect(source).toContain('function inspectLocalSignals()');
  });

  it('keeps TJM actions tied to pricing decisions instead of refresh only', () => {
    const pageSource = readFileSync('src/ui/pages/TJMPage.svelte', 'utf8');
    const dashboardSource = readFileSync('src/ui/organisms/TJMDashboard.svelte', 'utf8');
    const appSource = readFileSync('src/sidepanel/App.svelte', 'utf8');

    expect(pageSource).toContain("primaryActionLabel: 'Ajuster mon TJM cible'");
    expect(pageSource).toContain("primaryActionLabel: 'Scanner le feed'");
    expect(pageSource).toContain('onNavigateToProfile');
    expect(pageSource).toContain('onNavigateToFeed');
    expect(dashboardSource).toContain('type TjmSetupStep');
    expect(dashboardSource).toContain('3 étapes pour alimenter le radar TJM');
    expect(dashboardSource).toContain('Alimenter le radar TJM');
    expect(dashboardSource).toContain('Ajuster mon TJM cible');
    expect(appSource).toContain("onNavigateToProfile={() => nav.navigate('profile')}");
    expect(appSource).toContain("onNavigateToFeed={() => nav.navigate('feed')}");
  });

  it('routes missing CV source states to import or profile completion', () => {
    const cvSource = readFileSync('src/ui/pages/CvPage.svelte', 'utf8');
    const appSource = readFileSync('src/sidepanel/App.svelte', 'utf8');

    expect(cvSource).toContain("primaryActionLabel: 'Importer LinkedIn'");
    expect(cvSource).toContain('secondaryActionLabel="Compléter le profil"');
    expect(cvSource).toContain('onSecondaryAction={completeProfileManually}');
    expect(cvSource).toContain("primaryActionLabel: 'Prévisualiser LinkedIn'");
    expect(cvSource).not.toContain('const linkedInPrimaryLabel');
    expect(cvSource).toContain(
      "const sourceActionLabel = $derived(profile ? 'Tout préparer' : 'Compléter le profil')"
    );
    expect(cvSource).toContain('type CvWorkflowStep');
    expect(cvSource).toContain('const cvWorkflowSteps = $derived.by');
    expect(cvSource).toContain('Source canonique');
    expect(cvSource).toContain('Plateformes à mettre à jour');
    expect(cvSource).toContain('Dashboard connecté');
    expect(cvSource).toContain('Enregistrer comme source');
    expect(cvSource).not.toContain('Profil CV synchronisé dans Supabase');
    expect(cvSource).toContain('function handleSourceAction()');
    expect(appSource).toContain("onNavigateToProfile={() => nav.navigate('profile')}");
  });

  it('routes Applications story actions to the operationally recommended dossier', () => {
    const source = readFileSync('src/ui/pages/ApplicationsPage.svelte', 'utf8');

    expect(source).toContain('const recommendedTrackedMission = $derived.by');
    expect(source).toContain('!isTerminalStatus(record.currentStatus)');
    expect(source).toContain('isDueFollowUp(record, now)');
    expect(source).toContain("record.currentStatus === 'application_prepared'");
    expect(source).toContain('onPrimaryAction={handleApplicationStoryAction}');
    expect(source).toContain('function openRecommendedDossier()');
    expect(source).toContain('function getRecommendedDossierReason');
    expect(source).toContain('aria-label="Dossier recommandé"');
    expect(source).toContain('Dossier recommandé');
    expect(source.indexOf('Dossier recommandé')).toBeLessThan(
      source.indexOf('<ApplicationPipelineSummary')
    );
    expect(source).not.toContain('selectMission(trackedMissions[0].mission.id)');
  });

  it('keeps application decision history visible in the selected dossier', () => {
    const source = readFileSync('src/ui/pages/ApplicationsPage.svelte', 'utf8');

    expect(source).toContain('StatusTransition');
    expect(source).toContain('const selectedDecisionHistory = $derived.by');
    expect(source).toContain('selectedTracking.history.slice().reverse().slice(0, 4)');
    expect(source).toContain('function formatDecisionTransition');
    expect(source).toContain('Historique des décisions');
    expect(source).toContain('aria-label="Historique des décisions"');
    expect(source).toContain('formatDecisionNote(transition.note)');
  });

  it('keeps the application pipeline summary decision-oriented', () => {
    const source = readFileSync('src/ui/organisms/ApplicationPipelineSummary.svelte', 'utf8');

    expect(source).toContain('type PipelineInsightCard');
    expect(source).toContain('stateLabel');
    expect(source).toContain('hint');
    expect(source).toContain('Traiter le dossier recommandé.');
    expect(source).toContain('Ouvrir la relance échue.');
    expect(source).toContain('Finaliser l’envoi ou changer le statut.');
    expect(source).not.toContain('Accept.</p>');
  });

  it('keeps feed scoring signals actionable instead of raw counters', () => {
    const source = readFileSync('src/ui/organisms/FeedActionDashboard.svelte', 'utf8');

    expect(source).toContain('type FeedInsightItem');
    expect(source).toContain('stateLabel');
    expect(source).toContain('hint');
    expect(source).toContain('Insights actionnables du périmètre courant');
    expect(source).toContain('Comparer ces missions en premier.');
    expect(source).toContain('Filtrer ou négocier avant de postuler.');
    expect(source).not.toContain('Facteurs de scoring du périmètre courant');
  });

  it('distills the feed to a single next-action story (no redundant action queue)', () => {
    const source = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');

    // The OperationalStoryCard is the single next-action surface: one adaptive CTA.
    expect(source).toContain('eyebrow="À faire maintenant"');
    expect(source).toContain('variant="inline"');
    expect(source).toContain('onPrimaryAction={handleFeedStoryPrimaryAction}');

    // The redundant parallel "File d’actions" queue has been removed.
    expect(source).not.toContain('type FeedActionQueueItem');
    expect(source).not.toContain('const feedActionQueue = $derived.by');
    expect(source).not.toContain('data-testid="feed-action-queue"');
    expect(source).not.toContain('File d’actions');
    expect(source).not.toContain('{@render feedActionQueueBlock(true)}');
    expect(source).not.toContain('{@render feedActionQueueBlock(false)}');

    // Business presets stay available but move off the critical path,
    // gated behind "Détails opérationnels" (progressive disclosure).
    const presetsIdx = source.indexOf('aria-label="Presets métier du feed"');
    const advancedIdx = source.lastIndexOf('{#if showAdvancedControls}', presetsIdx);
    expect(advancedIdx).toBeGreaterThan(-1);
    expect(advancedIdx).toBeLessThan(presetsIdx);
  });

  it('keeps feed filters decision-oriented with business presets', () => {
    const feedSource = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');
    const stateSource = readFileSync('src/lib/state/feed-page.svelte.ts', 'utf8');

    expect(stateSource).toContain('type DecisionPresetId');
    expect(stateSource).toContain('const decisionPresets = $derived.by');
    expect(stateSource).toContain('function applyDecisionPreset');
    expect(stateSource).toContain('Remote compatible');
    expect(stateSource).toContain('TJM à négocier');
    expect(feedSource).toContain('Presets métier');
    expect(feedSource).toContain('page.decisionPresets');
    expect(feedSource).toContain('page.applyDecisionPreset(preset.id)');
  });

  it('keeps mission comparison decision-first before technical details', () => {
    const source = readFileSync('src/ui/organisms/MissionComparison.svelte', 'utf8');

    expect(source).toContain('type DecisionEvidence');
    expect(source).toContain('Décision recommandée');
    expect(source).toContain('recommendationDescription');
    expect(source).toContain(
      'La prochaine action est d’ouvrir cette mission ou de la mettre en suivi.'
    );
    expect(source).toContain('Départagez avec le TJM, le remote et la source avant de postuler.');
    expect(source.indexOf('Décision recommandée')).toBeLessThan(
      source.indexOf('<!-- Titles row -->')
    );
  });

  it('keeps mission investigation actionable before technical details', () => {
    const drawerSource = readFileSync('src/ui/organisms/MissionInvestigationDrawer.svelte', 'utf8');
    const cardSource = readFileSync('src/ui/molecules/MissionCard.svelte', 'utf8');
    const feedSource = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');
    const virtualFeedSource = readFileSync('src/ui/organisms/VirtualMissionFeed.svelte', 'utf8');

    expect(drawerSource).toContain('Transformer la décision');
    expect(drawerSource).toContain('Mettre en suivi');
    expect(drawerSource).toContain('Comparer');
    expect(drawerSource).toContain('Masquer');
    expect(drawerSource).toContain('Pourquoi ce score ?');
    expect(cardSource).toContain('Pourquoi ce score ?');
    expect(cardSource).toContain('function handleScoreDetailsToggle');
    expect(cardSource).toContain('aria-expanded={scoreDetailsOpen}');
    expect(cardSource).toContain('aria-controls={scoreDetailsId}');
    expect(cardSource.indexOf('Pourquoi ce score ?')).toBeLessThan(
      cardSource.indexOf('<!-- Detail grid -->')
    );
    expect(drawerSource.indexOf('Transformer la décision')).toBeLessThan(
      drawerSource.indexOf('Détails techniques')
    );
    expect(feedSource).toContain('function loadTrackingStore()');
    expect(feedSource).toContain('createTrackingStore');
    expect(feedSource).toContain('onSelectForTracking');
    expect(feedSource).toContain('function handleInvestigationSelectForTracking()');
    expect(feedSource).toContain("handleTrackingTransition(investigationMission.id, 'selected')");
    expect(virtualFeedSource).toContain('trackingByMissionId');
    expect(virtualFeedSource).toContain('onStatusTransition');
  });

  it('keeps feed tracking timestamps visible after status changes', () => {
    const cardSource = readFileSync('src/ui/molecules/MissionCard.svelte', 'utf8');
    const drawerSource = readFileSync('src/ui/organisms/MissionInvestigationDrawer.svelte', 'utf8');
    const feedSource = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');
    const virtualFeedSource = readFileSync('src/ui/organisms/VirtualMissionFeed.svelte', 'utf8');

    expect(cardSource).toContain('trackingUpdatedAt');
    expect(cardSource).toContain('Modifié {trackingUpdatedLabel}');
    expect(drawerSource).toContain('trackingUpdatedAt');
    expect(drawerSource).toContain('Modifié {trackingUpdatedLabel}');
    expect(feedSource).toContain(
      'trackingUpdatedAt={getTrackingUpdatedAt(investigationMission.id)}'
    );
    expect(virtualFeedSource).toContain('getLastTransitionTime(missionTracking)');
  });

  it('keeps feed status transitions undoable', () => {
    const source = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');

    expect(source).toContain('function cloneTrackingSnapshot');
    expect(source).toContain('const previousTracking = cloneTrackingSnapshot');
    expect(source).toContain('showToastAction(`Statut: ${STATUS_LABELS[status]}`');
    expect(source).toContain("label: 'Annuler'");
    expect(source).toContain('trackingStore.restoreTracking(missionId, previousTracking)');
  });

  it('keeps feed undo and hidden-filter microcopy accented', () => {
    const feedStateSource = readFileSync('src/lib/state/feed-page.svelte.ts', 'utf8');
    const feedSource = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');
    const filterSource = readFileSync('src/ui/organisms/FilterBar.svelte', 'utf8');

    expect(feedStateSource).toContain('Favori retiré');
    expect(feedStateSource).toContain('Mission ajoutée aux favoris');
    expect(feedStateSource).toContain('Mission restaurée');
    expect(feedStateSource).toContain('Mission masquée');
    expect(feedSource).toContain('Voir les ignorées');
    expect(feedSource).toContain('Raccourci clavier : h.');
    expect(filterSource).toContain('Retire cette vue sauvegardée.');
    expect(`${feedStateSource}\n${feedSource}\n${filterSource}`).not.toMatch(
      /retire|ajoutee|restauree|masquee|ignoree|sauvegardee/
    );
  });

  it('keeps extension operational error copy accented', () => {
    const profileSource = readFileSync('src/ui/pages/ProfilePage.svelte', 'utf8');
    const emptyStateSource = readFileSync('src/ui/molecules/OperationalEmptyState.svelte', 'utf8');
    const drawerSource = readFileSync('src/ui/organisms/MissionInvestigationDrawer.svelte', 'utf8');
    const sourceHealthSource = readFileSync('src/ui/organisms/SourceHealthPanel.svelte', 'utf8');
    const controllerSource = readFileSync(
      'src/lib/shell/facades/feed-controller.svelte.ts',
      'utf8'
    );
    const tjmSource = readFileSync('src/ui/organisms/TJMDashboard.svelte', 'utf8');

    expect(profileSource).toContain('À compléter');
    expect(profileSource).toContain('réduisent la précision des requêtes');
    expect(emptyStateSource).toContain('Décision');
    expect(drawerSource).toContain('eyebrow="Décision"');
    expect(sourceHealthSource).toContain('Vérification en cours');
    expect(sourceHealthSource).toContain('Vérifier les connexions');
    expect(controllerSource).toContain('Vérifiez votre réseau et réessayez.');
    expect(controllerSource).toContain('Erreur réseau lors du scan. Réessayez');
    expect(tjmSource).toContain('eyebrow="Décision tarifaire"');
  });

  it('keeps the feed comparison flow explicit and actionable', () => {
    const cardSource = readFileSync('src/ui/molecules/MissionCard.svelte', 'utf8');
    const feedSource = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');
    const virtualFeedSource = readFileSync('src/ui/organisms/VirtualMissionFeed.svelte', 'utf8');

    expect(cardSource).toContain('Ajouter la mission à la comparaison');
    expect(cardSource).toContain('Trois missions sont déjà sélectionnées');
    expect(virtualFeedSource).toContain('comparisonMissionIds');
    expect(virtualFeedSource).toContain('comparisonLimitReached');
    expect(feedSource).toContain('let showComparison = $state(false)');
    expect(feedSource).toContain('function openComparison()');
    expect(feedSource).toContain('onclick={openComparison}');
    expect(feedSource).toContain(
      '{#if showComparison && page.comparisonMissions.length >= 2 && MissionComparison}'
    );
    expect(feedSource).not.toContain('onclick={() => {}}');
  });

  it('keeps source health rows diagnostic and action-oriented', () => {
    const source = readFileSync('src/ui/organisms/SourceHealthPanel.svelte', 'utf8');

    expect(source).toContain('type SourceDiagnosis');
    expect(source).toContain('function getSourceDiagnosis');
    expect(source).toContain('Le radar ne doit pas être considéré fiable pour cette source.');
    expect(source).toContain('Relancez le diagnostic puis reconnectez si l’échec persiste.');
    expect(source).toContain('Les résultats peuvent être partiels ou retardés.');
    expect(source).toContain('Filtrez cette source si vous voulez investiguer son volume.');
    expect(source).toContain("{isEnabled ? 'Relancer' : 'Activer'}");
    expect(source).not.toContain("'Re-check'");
  });

  it('keeps connector health cards diagnostic instead of raw metric strips', () => {
    const source = readFileSync('src/ui/molecules/ConnectorHealthCard.svelte', 'utf8');

    expect(source).toContain('type ConnectorDiagnosis');
    expect(source).toContain('statusLabel');
    expect(source).toContain('hint');
    expect(source).toContain('Collecte suspendue');
    expect(source).toContain('Sonde en cours');
    expect(source).toContain('Fiabilité dégradée');
    expect(source).toContain('Collecte fiable');
    expect(source).toContain('Dernier succès :');
    expect(source).not.toContain('Échecs consécutifs');
  });

  it('keeps the metrics panel diagnostic and action-first', () => {
    const source = readFileSync('src/ui/organisms/MetricsPanel.svelte', 'utf8');
    const appSource = readFileSync('src/sidepanel/App.svelte', 'utf8');

    expect(source).toContain('type OperationalSummary');
    expect(source).toContain('type MetricSignal');
    expect(source).toContain('Diagnostic opérationnel');
    expect(source).toContain('Signaux prioritaires');
    expect(source).toContain('Action recommandée');
    expect(source).toContain('Latences à prioriser');
    expect(source).toContain('Timeline des scans');
    expect(source).toContain('Diagnostic cache');
    expect(source).toContain('Expérience perçue');
    expect(source).toContain('fixed inset-0 z-50 overflow-auto bg-page-canvas');
    expect(source).not.toContain('bg-page-canvas/95');
    expect(source).not.toContain('Avg Scan Time');
    expect(source).not.toContain('Cache Hit Rate');
    expect(source).not.toContain('Dedup Ratio');
    expect(source).not.toContain('Operation Timings');
    expect(source).not.toContain('metrics collected');
    expect(appSource).toContain("import('../ui/organisms/MetricsPanel.svelte')");
    expect(appSource).toContain('<MetricsPanel />');
  });

  it('keeps the dev panel scenario-driven instead of raw controls only', () => {
    const source = readFileSync('src/dev/DevPanel.svelte', 'utf8');

    expect(source).toContain('type DevScenario');
    expect(source).toContain('Centre de contrôle des scénarios locaux');
    expect(source).toContain('Prochaine action');
    expect(source).toContain('Simuler une situation visible');
    expect(source).toContain('Impact attendu');
    expect(source).toContain('Timeline des messages runtime');
    expect(source).toContain('Diagnostic complet');
    expect(source).toContain('Provoquer cache froid');
    expect(source).toContain('z-[60]');
    expect(source).not.toContain('Avg Time');
    expect(source).not.toContain('Cache Stats');
    expect(source).not.toContain('No messages yet');
    expect(source).not.toContain('bg-accent-red');
  });

  it('keeps destructive settings actions gated by operational impact confirmation', () => {
    const source = readFileSync('src/ui/organisms/DangerZone.svelte', 'utf8');
    const settingsSource = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');

    expect(source).toContain("confirmationText === 'SUPPRIMER'");
    expect(source).toContain('function handleConfirmReset()');
    expect(source).toContain('scrollIntoView');
    expect(source).toContain('disabled={!canConfirmReset}');
    expect(source).toContain('onCreateBackup');
    expect(source).toContain('Créer une sauvegarde avant suppression');
    expect(source).toContain('Suppression irréversible');
    expect(source).toContain(
      'Impact : profil, missions, favoris, masquées, vues et caches IA supprimés'
    );
    expect(source).toContain('Après suppression : relancer l’onboarding');
    expect(source).toContain('Tapez SUPPRIMER pour confirmer');
    expect(settingsSource).toContain('onCreateBackup={handleCreateBackup}');
    expect(source).not.toContain('Confirmer la suppression');
  });

  it('keeps backup restoration gated by explicit impact confirmation', () => {
    const source = readFileSync('src/ui/molecules/BackupRestoreModal.svelte', 'utf8');

    expect(source).toContain("confirmationText === 'RESTAURER'");
    expect(source).toContain('function handleConfirm()');
    expect(source).toContain('disabled={isRestoring || !canConfirmRestore}');
    expect(source).toContain('Décision requise');
    expect(source).toContain('Impact : l’état actuel sera remplacé');
    expect(source).toContain('Après restauration : vérifiez le feed');
    expect(source).toContain('Tapez RESTAURER pour confirmer');
    expect(source).not.toContain('Confirmer la restauration');
  });
});
