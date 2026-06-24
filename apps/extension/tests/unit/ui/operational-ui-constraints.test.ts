import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function listSvelteUiFiles(): string[] {
  return execSync("rg --files src/ui src/sidepanel -g '*.svelte'", {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
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
    expect(source).toContain('Voir les ${formatMissionCount(newCount)}');
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
    expect(source).not.toContain('NAV_ITEMS.filter');
    expect(source).not.toContain('Premium pages hidden');
  });

  it('keeps Settings system actions aligned with the stated operational issue', () => {
    const source = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');

    expect(source).toContain("primaryActionLabel: 'Voir les reglages IA'");
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

  it('presents Markdown export as a shareable shortlist report', () => {
    const settingsSource = readFileSync('src/ui/pages/SettingsPage.svelte', 'utf8');
    const exportSource = readFileSync('src/lib/core/export/mission-export.ts', 'utf8');

    expect(settingsSource).toContain('Rapport shortlist');
    expect(settingsSource).toContain('rappel de confidentialité locale');
    expect(settingsSource).toContain('Markdown');
    expect(exportSource).toContain('## Synthèse shortlist');
    expect(exportSource).toContain('## Missions retenues');
    expect(exportSource).toContain('**Confidentialité:** rapport local généré depuis vos favoris');
  });

  it('keeps Profile story CTAs aligned with edit/save state', () => {
    const source = readFileSync('src/ui/pages/ProfilePage.svelte', 'utf8');

    expect(source).toContain(
      "primaryActionLabel: settings.editingProfile ? 'Enregistrer' : 'Modifier le profil'"
    );
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
    expect(source).toContain('isTrackingDue(record, now)');
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

  it('keeps the feed story followed by a compact action queue', () => {
    const source = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');

    expect(source).toContain('type FeedActionQueueItem');
    expect(source).toContain('const feedActionQueue = $derived.by');
    expect(source).toContain('data-testid="feed-action-queue"');
    expect(source).toContain('File d’actions');
    expect(source).toContain('Corriger ${firstBroken.connectorName}');
    expect(source).toContain('Traiter ${formatMissionCount(alertMatchCount)} en alerte');
    expect(source).toContain('Qualifier ${formatMissionCount(newCount)}');
    expect(source).toContain('{@render feedActionQueueBlock(true)}');
    expect(source).toContain('{@render feedActionQueueBlock(false)}');
    expect(source.indexOf('{@render feedActionQueueBlock(false)}')).toBeLessThan(
      source.indexOf('<ConnectorStatusList')
    );
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
    const feedSource = readFileSync('src/ui/pages/FeedPage.svelte', 'utf8');
    const virtualFeedSource = readFileSync('src/ui/organisms/VirtualMissionFeed.svelte', 'utf8');

    expect(drawerSource).toContain('Transformer la décision');
    expect(drawerSource).toContain('Mettre en suivi');
    expect(drawerSource).toContain('Comparer');
    expect(drawerSource).toContain('Masquer');
    expect(drawerSource).toContain('Pourquoi ce score ?');
    expect(drawerSource.indexOf('Transformer la décision')).toBeLessThan(
      drawerSource.indexOf('Détails techniques')
    );
    expect(feedSource).toContain('const tracking = createTrackingStore()');
    expect(feedSource).toContain('onSelectForTracking');
    expect(feedSource).toContain('function handleInvestigationSelectForTracking()');
    expect(feedSource).toContain("handleTrackingTransition(investigationMission.id, 'selected')");
    expect(virtualFeedSource).toContain('trackingByMissionId');
    expect(virtualFeedSource).toContain('onStatusTransition');
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
    expect(feedSource).toContain('{#if showComparison && page.comparisonMissions.length >= 2}');
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

    expect(source).toContain("confirmationText === 'SUPPRIMER'");
    expect(source).toContain('function handleConfirmReset()');
    expect(source).toContain('scrollIntoView');
    expect(source).toContain('disabled={!canConfirmReset}');
    expect(source).toContain('Suppression irréversible');
    expect(source).toContain(
      'Impact : profil, missions, favoris, masquées, vues et caches IA supprimés'
    );
    expect(source).toContain('Après suppression : relancer l’onboarding');
    expect(source).toContain('Tapez SUPPRIMER pour confirmer');
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
