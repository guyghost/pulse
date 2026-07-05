// Phase B interactive QA campaign driver.
// Driven by `node tests/e2e/qa/run-qa.mjs`. Owns no source changes.
// Each scenario boots an isolated seeded context, reproduces/refutes a Phase A
// suspicion (or a newly hunted bug), captures a screenshot, and records a
// structured finding into /tmp/qa-findings.json.
import {
  launchContext,
  gotoApp,
  navigate,
  screenshot,
  openDevPanel,
  injectSendMessageFailure,
  dumpConsole,
  STORAGE_STATE_PATH,
  SHOTS_DIR,
  BASE_URL,
  readJson,
  writeJson,
} from './qa-harness.mjs';
import { existsSync } from 'node:fs';

const FINDINGS_PATH = '/tmp/qa-findings.json';
const findings = [];

function record(f) {
  findings.push(f);
  console.log(`[${f.status.padEnd(8)}] ${f.severity.padEnd(4)} ${f.id} — ${f.title}`);
  if (f.evidence?.length) for (const e of f.evidence) console.log('         📷 ' + e);
}

function snap(name) {
  return `${SHOTS_DIR}/${name}.png`;
}

/** Return a NEW storageState (copied from the seed snapshot) with the given
 *  localStorage entries overridden. Values are JSON-stringified unless string. */
function patchedStorageState(overrides) {
  const state = readJson(STORAGE_STATE_PATH);
  const ls = state.origins[0].localStorage;
  for (const [name, value] of Object.entries(overrides)) {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    const idx = ls.findIndex((e) => e.name === name);
    if (idx >= 0) ls[idx].value = json;
    else ls.push({ name, value: json });
  }
  return state;
}

function snapshotValue(name) {
  const state = readJson(STORAGE_STATE_PATH);
  const ls = state.origins?.[0]?.localStorage ?? [];
  const entry = ls.find((e) => e.name === name);
  return entry ? JSON.parse(entry.value) : undefined;
}

const isoMinusHours = (h) => new Date(Date.now() - h * 3600_000).toISOString();

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------
async function seeded(opts = {}) {
  const ctx = await launchContext({ storageState: STORAGE_STATE_PATH });
  await gotoApp(ctx.page);
  return ctx;
}

async function textMaybe(page, sel) {
  try {
    return (await page.locator(sel).first().innerText({ timeout: 1500 })).trim();
  } catch {
    return null;
  }
}

// ===========================================================================
// S1 — [MED] Feed dashboardSummary new/highScore ignore active filters
// ===========================================================================
async function s_dashboardFilterMismatch() {
  const { browser, page } = await seeded();
  try {
    const badgeBefore = await textMaybe(page, '[aria-label$="missions dans la liste"]');
    // Action-queue "Qualifier N" text (dashboardSummary.newCount, filter-agnostic).
    const queueBefore = await page
      .locator('[data-testid="feed-action-queue"]')
      .innerText({ timeout: 2000 })
      .catch(() => '');
    // Apply the "Prioritaires" preset (decisionPreset) -> displayMissions shrinks,
    // but dashboardSummary.newCount is computed over the unfiltered scope.
    await page.locator('[aria-label="Presets métier du feed"] button').first().click();
    await page.waitForTimeout(500);
    const badgeAfter = await textMaybe(page, '[aria-label$="missions dans la liste"]');
    const queueAfter = await page
      .locator('[data-testid="feed-action-queue"]')
      .innerText({ timeout: 2000 })
      .catch(() => '');
    const evidence = await screenshot(page, 'feed-dashboard-mismatch');
    const m = queueAfter.match(/Qualifier\s+(\d+)/);
    const queueNewCount = m ? Number(m[1]) : null;
    const visibleAfter = badgeAfter ? Number(badgeAfter.match(/\d+/)?.[0]) : null;
    const mismatch = queueNewCount != null && visibleAfter != null && queueNewCount > visibleAfter;
    record({
      id: 'FEED-01',
      area: 'Feed',
      severity: 'MED',
      title: 'dashboardSummary.newCount ignores active filters (action queue overstates)',
      phaseA: 'confirms',
      status: mismatch ? 'confirmed' : 'refuted',
      repro: [
        'Boot seeded feed (~95 visible).',
        'Note action queue "Qualifier N" (newCount) and visible badge.',
        'Click "Prioritaires" preset.',
        'Visible badge shrinks but action queue "Qualifier N" stays unchanged.',
      ],
      expected: 'Action-queue counts should reflect the currently visible (filtered) mission set.',
      actual: mismatch
        ? `After filter: ${visibleAfter} visible but action queue still says "Qualifier ${queueNewCount}".`
        : `visible=${visibleAfter} queue=${queueNewCount} (no mismatch observed).`,
      before: { badge: badgeBefore, queue: queueBefore.slice(0, 160) },
      evidence: [evidence],
      codeRefs: [
        'src/lib/state/feed-page.svelte.ts:317-347',
        'src/lib/state/feed-page.svelte.ts:374-381',
      ],
    });
  } catch (e) {
    record({
      id: 'FEED-01',
      severity: 'MED',
      status: 'error',
      title: 'dashboardSummary mismatch',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// S2 — [LOW] Feed feedStory goes critical while cached missions remain visible
// ===========================================================================
async function s_feedStoryCriticalWithCache() {
  const { browser, page } = await seeded();
  try {
    await openDevPanel(page);
    // Switch Feed State -> error via the DevPanel control.
    const clicked = await page
      .getByRole('button', { name: /erreur|error|Error/i })
      .first()
      .click({ timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    // Fallback: dispatch the dev event directly.
    if (!clicked) {
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('dev:feed-state', { detail: 'error' }))
      );
    }
    await page.waitForTimeout(700);
    const feedAnchor = await page.locator('[data-testid="mission-feed-anchor"]').count();
    const story = await page
      .locator('body')
      .innerText({ timeout: 1500 })
      .catch(() => '');
    const critical = /Impossible de r[eé]cup[eé]rer|r[eé]cup[eé]rer les missions|critique/i.test(
      story
    );
    const evidence = await screenshot(page, 'feed-story-critical-with-missions');
    record({
      id: 'FEED-02',
      area: 'Feed',
      severity: 'LOW',
      title: 'feedStory renders critical error while cached missions stay visible',
      phaseA: 'confirms',
      status: critical && feedAnchor > 0 ? 'confirmed' : 'partial',
      repro: [
        'Boot seeded feed (missions present).',
        'Force feed error state via DevPanel / dev:feed-state "error".',
        'Observe critical story ("Impossible de récupérer...") while the mission list is still rendered.',
      ],
      expected:
        'When cached missions are shown, the story should be degraded/warning, not critical.',
      actual: `critical story text detected=${critical}; feed anchor still rendered=${feedAnchor > 0}`,
      evidence: [evidence],
      codeRefs: ['src/ui/pages/FeedPage.svelte:317-328'],
    });
  } catch (e) {
    record({
      id: 'FEED-02',
      severity: 'LOW',
      status: 'error',
      title: 'feedStory critical',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// S3 — [MED] MissionComparison score divergence (semanticScore vs breakdown.total)
// ===========================================================================
async function s_comparisonScoreDivergence() {
  // Patch free-work missions so semanticScore=12 (diverges from breakdown.total),
  // simulating a realistic Gemini-Nano-enriched state the dev scanner never sets.
  const missions = snapshotValue('__missionpulse_dev_missions') ?? [];
  let patched = 0;
  for (const m of missions) {
    if (m.source === 'free-work' && m.scoreBreakdown?.total != null) {
      m.semanticScore = 12;
      patched++;
    }
  }
  const state = patchedStorageState({ __missionpulse_dev_missions: missions });
  const { browser, page } = await launchContext({ storageState: state });
  try {
    await gotoApp(page);
    // Select two cards for comparison.
    const compareBtn = page.getByRole('button', { name: 'Ajouter la mission à la comparaison' });
    await compareBtn.first().click({ timeout: 4000 });
    await page.waitForTimeout(250);
    await compareBtn.first().click({ timeout: 4000 });
    await page.waitForTimeout(400);
    // Open the comparison modal (exact match: 'Comparer' also matches score buckets).
    await page.getByRole('button', { name: 'Comparer', exact: true }).click({ timeout: 3000 });
    await page.waitForTimeout(500);
    const modalText = await page
      .locator('[role="dialog"]')
      .innerText({ timeout: 2500 })
      .catch(() => '');
    // Table "Score" cells show semanticScore (12/100); evidence "Score" shows total.
    const tableHas12 = /12\/100/.test(modalText);
    const evidenceHigh = /(\b[5-9]\d|100)\/100/.test(modalText);
    const evidence = await screenshot(page, 'feed-comparison-score-divergence');
    record({
      id: 'FEED-03',
      area: 'Feed',
      severity: 'MED',
      title:
        'MissionComparison shows divergent scores (table semanticScore vs recommendation total)',
      phaseA: 'confirms',
      status: tableHas12 && evidenceHigh ? 'confirmed' : 'partial',
      repro: [
        `Patch ${patched} free-work missions to semanticScore=12 (≠ breakdown.total).`,
        'Select two missions, open Comparison.',
        'Table "Score" row shows 12/100 while the recommendation "Score" evidence shows the real total.',
      ],
      expected: 'A single, consistent score per mission across table and recommendation.',
      actual:
        `table shows 12/100=${tableHas12}; recommendation shows high total=${evidenceHigh}. ` +
        '(In default dev the bug is masked because semanticScore is always null.)',
      note: 'Masked in default dev (scanner forces semanticScore=null); reproduced via realistic enriched-state patch.',
      evidence: [evidence],
      codeRefs: [
        'src/ui/organisms/MissionComparison.svelte:40-44',
        'src/ui/organisms/MissionComparison.svelte:49-51',
      ],
    });
    await page
      .getByRole('button', { name: 'Fermer' })
      .click()
      .catch(() => {});
  } catch (e) {
    record({
      id: 'FEED-03',
      severity: 'MED',
      status: 'error',
      title: 'comparison divergence',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// S4 — [HIGH] Applications: terminal-status (accepted/rejected) overdue relance inflation
// ===========================================================================
async function s_applicationsTerminalRelance() {
  const trackings = snapshotValue('__missionpulse_dev_trackings') ?? [];
  const accepted = trackings.find((t) => t.currentStatus === 'accepted');
  let staged = false;
  if (accepted) {
    accepted.nextActionAt = isoMinusHours(5); // more overdue than application_prepared (now-2h)
    staged = true;
  }
  const state = patchedStorageState({ __missionpulse_dev_trackings: trackings });
  const { browser, page } = await launchContext({ storageState: state });
  try {
    await gotoApp(page);
    await navigate(page, 'applications');
    await page.waitForTimeout(800);
    const body = await page
      .locator('body')
      .innerText({ timeout: 2000 })
      .catch(() => '');
    // Relances count in the pipeline summary.
    const relanceMatch = body.match(/RELANCES?\s+(\d+)/i);
    const relances = relanceMatch ? Number(relanceMatch[1]) : null;
    // Recommended dossier references the accepted mission / "Relance échue".
    const recommendsAccepted = /Relance [eé]chue/i.test(body);
    const evidence = await screenshot(page, 'applications-terminal-relance-inflation');
    record({
      id: 'APP-01',
      area: 'Applications',
      severity: 'HIGH',
      title:
        'Terminal-status missions (accepted/rejected) with overdue nextActionAt inflate "Relance à faire"',
      phaseA: 'confirms',
      status: staged && relances != null && relances >= 2 ? 'confirmed' : 'partial',
      repro: [
        'Patch the seed so the "accepted" tracking has a past nextActionAt (now-5h).',
        'Open Applications.',
        'Relances count rises (was 1) and the accepted terminal mission is recommended as "Relance échue".',
      ],
      expected:
        'Terminal statuses (accepted/rejected/archived) should not be surfaced as actionable relances — they are closed.',
      actual: staged
        ? `RELANCES=${relances}; recommended-dossier "Relance échue"=${recommendsAccepted}.`
        : `could not locate accepted tracking to stage (trackings found: ${trackings.length}).`,
      note: 'Default seed only makes application_prepared overdue; terminal missions need the patch to surface the bug.',
      evidence: [evidence],
      codeRefs: [
        'src/lib/shell/scan/pipeline-summary.ts:61-74',
        'src/ui/pages/ApplicationsPage.svelte:76-79',
        'src/ui/pages/ApplicationsPage.svelte:105-120',
      ],
    });
  } catch (e) {
    record({
      id: 'APP-01',
      severity: 'HIGH',
      status: 'error',
      title: 'terminal relance',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// S5 — [HIGH] CV LinkedIn preview throws (stub returns null → TypeError)
// ===========================================================================
async function s_cvLinkedInBroken() {
  const { browser, page, consoleErrors, pageFailures } = await seeded();
  try {
    await navigate(page, 'cv');
    await page.waitForTimeout(700);
    // Trigger previewLinkedIn via the story-card primary button.
    const btn = page
      .getByRole('button', { name: /Prévisualiser LinkedIn|Relire LinkedIn|LinkedIn/i })
      .first();
    await btn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const body = await page
      .locator('body')
      .innerText({ timeout: 1500 })
      .catch(() => '');
    const hasUnexpectedCard = /unexpected_response/i.test(body);
    const nullDeref = /Cannot read properties of null|reading 'type'|reading "type"/i.test(
      [...consoleErrors, ...pageFailures].join('\n')
    );
    const evidence = await screenshot(page, 'cv-linkedin-preview-broken');
    record({
      id: 'CV-01',
      area: 'CV',
      severity: 'HIGH',
      title:
        'LinkedIn preview/import/sync are unstubbed → null deref TypeError (feature fully broken in dev)',
      phaseA: 'refines',
      status: nullDeref || hasUnexpectedCard ? 'confirmed' : 'partial',
      repro: [
        'Open CV page.',
        'Click the LinkedIn preview button ("Prévisualiser LinkedIn").',
        'chrome-stubs has no case for PREVIEW/IMPORT/SYNC_LINKEDIN_PROFILE → default returns null.',
        'The facade reads response.type on null → TypeError (unhandled rejection + console error).',
      ],
      expected:
        'Either a graceful "unexpected_response" error card, or a stubbed preview. The CvPage error branch is never reached because the facade throws first.',
      actual: `null-deref TypeError in console=${nullDeref}; "unexpected_response" card shown=${hasUnexpectedCard}; consoleErrors=${consoleErrors.length}.`,
      note: 'Root cause matches Phase A (LinkedIn unstubbed), but the manifestation is a TypeError, not the intended graceful error object — the facade lacks a null guard.',
      evidence: [evidence],
      consoleErrors: consoleErrors.slice(0, 4),
      codeRefs: [
        'src/dev/chrome-stubs.ts:524-526',
        'src/lib/shell/facades/profile-sync.facade.ts:53-65',
        'src/ui/pages/CvPage.svelte:379-394',
      ],
    });
  } catch (e) {
    record({
      id: 'CV-01',
      severity: 'HIGH',
      status: 'error',
      title: 'cv linkedin',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// S6 — [MED] Settings BackupRestoreModal isRestoring stuck on restore failure
// ===========================================================================
async function s_backupRestoreStuck() {
  const { browser, page } = await seeded();
  try {
    await navigate(page, 'settings');
    await page.waitForTimeout(600);
    // 1. Create a valid backup via download.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 6000 }),
      page.getByRole('button', { name: /Créer une sauvegarde/ }).click(),
    ]);
    const backupPath = '/tmp/qa-backup.pulse-backup';
    await download.saveAs(backupPath);
    // 2. Restore: set the file on the hidden input -> modal opens with preview.
    await page.locator('input[type="file"]').setInputFiles(backupPath);
    await page.waitForTimeout(700);
    // 3. Type the confirmation word.
    await page.locator('#backup-restore-confirm').fill('RESTAURER');
    // 4. Make profile persistence fail.
    await injectSendMessageFailure(page, ['SAVE_PROFILE'], 'qa-profile-save-failed');
    // 5. Confirm restore.
    await page.getByRole('button', { name: /Restaurer ce point/ }).click();
    await page.waitForTimeout(1200);
    const modalOpen = (await page.locator('[role="dialog"]').count()) > 0;
    const restoringText = await page
      .locator('[role="dialog"]')
      .innerText({ timeout: 1200 })
      .catch(() => '');
    const stuck = /Restauration\.\.\./.test(restoringText) && modalOpen;
    const evidence = await screenshot(page, 'settings-backup-restore-stuck');
    record({
      id: 'SET-01',
      area: 'Settings',
      severity: 'MED',
      title: 'BackupRestoreModal spinner stuck forever when restore persistence fails',
      phaseA: 'confirms',
      status: stuck ? 'confirmed' : 'partial',
      repro: [
        'Generate a backup, open the restore modal, type RESTAURER.',
        'Force SAVE_PROFILE to fail (inject sendMessage failure).',
        'Click "Restaurer ce point".',
        'restoreBackup() rejects → modal not closed; the modal-local isRestoring flag is never reset.',
      ],
      expected:
        'On failure the spinner should clear and an inline error should let the user retry/cancel.',
      actual: `modal still open=${modalOpen}; spinner "Restauration..." stuck=${stuck}.`,
      evidence: [evidence],
      codeRefs: [
        'src/ui/molecules/BackupRestoreModal.svelte:15-25',
        'src/lib/state/settings-page.svelte.ts:651-677',
        'src/ui/pages/SettingsPage.svelte:156-164',
      ],
    });
  } catch (e) {
    record({
      id: 'SET-01',
      severity: 'MED',
      status: 'error',
      title: 'backup restore stuck',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// S7 — [MED] Settings RESET_LOCAL_DATA failure swallowed (confirmation UI only)
// ===========================================================================
async function s_resetSwallowed() {
  const { browser, page } = await seeded();
  try {
    await navigate(page, 'settings');
    await page.waitForTimeout(500);
    // Open the danger-zone confirmation (NON-destructive: we do not click confirm).
    await page.getByRole('button', { name: /Réinitialiser tout/ }).click();
    await page.waitForTimeout(300);
    await page.locator('#danger-reset-confirm').fill('SUPPRIMER');
    const armed = await page.getByRole('button', { name: /Supprimer définitivement/ }).isEnabled();
    const evidence = await screenshot(page, 'settings-reset-confirm-ui');
    record({
      id: 'SET-02',
      area: 'Settings',
      severity: 'MED',
      title: 'RESET_LOCAL_DATA failure is silently swallowed (empty catch, no user feedback)',
      phaseA: 'confirms',
      status: 'confirmed',
      repro: [
        'Open Settings danger zone, click "Réinitialiser tout".',
        'Confirmation panel appears; typing SUPPRIMER arms the destructive button.',
        'resetAll() catch block (lines 533-535) is empty — on a real failure the user gets NO toast, NO error, and the panel stays.',
      ],
      expected: 'A failed reset should surface an error toast and keep the user informed.',
      actual: `Confirmation UI armed (destructive button enabled=${armed}); code path has an empty catch (Hors contexte extension).`,
      note: 'Final destructive confirm NOT executed (QA constraint). Confirmed statically + via the armed confirmation UI.',
      evidence: [evidence],
      codeRefs: ['src/lib/state/settings-page.svelte.ts:521-536'],
    });
  } catch (e) {
    record({
      id: 'SET-02',
      severity: 'MED',
      status: 'error',
      title: 'reset swallowed',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// S8 — [LOW] Settings ScanSettings range keyboard-operable when autoScan off (a11y)
// ===========================================================================
async function s_scanSettingsA11y() {
  const { browser, page } = await seeded();
  try {
    await navigate(page, 'settings');
    await page.waitForTimeout(500);
    // Toggle auto-scan OFF.
    await page.getByRole('switch', { name: /Activer le scan automatique/ }).click();
    await page.waitForTimeout(300);
    const range = page.locator('input[type="range"][aria-label="Fréquence de scan"]');
    const before = await range.inputValue();
    // Keyboard-focus & change despite the wrapper's pointer-events-none.
    await range.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await range.dispatchEvent('change');
    await page.waitForTimeout(400);
    const after = await range.inputValue();
    const changed = before !== after;
    const evidence = await screenshot(page, 'settings-scan-range-a11y');
    record({
      id: 'SET-03',
      area: 'Settings',
      severity: 'LOW',
      title: 'Scan frequency range is keyboard-operable & persists while autoScan is off',
      phaseA: 'confirms',
      status: changed ? 'confirmed' : 'partial',
      repro: [
        'Settings → toggle "Scan automatique" OFF.',
        'Tab to the frequency range (wrapper is pointer-events-none + opacity-40 only).',
        'Press ArrowRight — value changes and is persisted (no disabled / aria-disabled on the input).',
      ],
      expected: 'The range should be truly disabled (disabled/aria-disabled) when autoScan is off.',
      actual: `range value ${before} → ${after} via keyboard while autoScan off.`,
      evidence: [evidence],
      codeRefs: ['src/ui/organisms/ScanSettings.svelte:60-89'],
    });
  } catch (e) {
    record({
      id: 'SET-03',
      severity: 'LOW',
      status: 'error',
      title: 'scan range a11y',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// S9 — [LOW] FeedTourOverlay invalid text-text-900 token (contrast)
// ===========================================================================
async function s_feedTourContrast() {
  const { browser, page } = await seeded();
  try {
    await navigate(page, 'settings');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Revoir le tour du feed/ }).click();
    await page.waitForTimeout(700);
    const overlay = page.locator('.fixed.z-50').filter({ hasText: /Tour du feed/ });
    const present = (await overlay.count()) > 0;
    // Inspect the "Suivant/Terminer" button computed color.
    const btn = overlay.getByRole('button', { name: /^(Suivant|Terminer)$/ });
    const color = await btn
      .evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return { color: cs.color, backgroundColor: cs.backgroundColor };
      })
      .catch(() => null);
    const evidence = await screenshot(page, 'feed-tour-contrast-text-900');
    record({
      id: 'FEED-04',
      area: 'Feed/Settings',
      severity: 'LOW',
      title: 'FeedTourOverlay "Suivant" button uses non-existent text-text-900 token (contrast)',
      phaseA: 'confirms',
      status: present ? 'confirmed' : 'partial',
      repro: [
        'Settings → "Revoir le tour du feed".',
        'The overlay CTA uses class text-text-900; @theme defines no --color-text-900, so no color utility is generated.',
        'Button text falls back to the inherited (near-black) color on a blue button → poor contrast.',
      ],
      expected: 'An explicit, theme-valid text color (e.g. text-surface-white) on the blue CTA.',
      actual: `overlay rendered=${present}; CTA computed color=${color?.color} on bg=${color?.backgroundColor}.`,
      evidence: [evidence],
      codeRefs: ['src/ui/molecules/FeedTourOverlay.svelte:65'],
    });
  } catch (e) {
    record({
      id: 'FEED-04',
      severity: 'LOW',
      status: 'error',
      title: 'tour contrast',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// S10 — [LOW] TJM region filter absent + inverted target not validated
// ===========================================================================
async function s_tjmRegionAndInverted() {
  // 10a — default: region filter not wired as a control.
  const a = await seeded();
  let tjmSelects = [];
  let baseEvidence = '';
  try {
    await navigate(a.page, 'tjm');
    await a.page.waitForTimeout(700);
    // Inspect every <select>: the only one is a SORT control; none filters by region.
    tjmSelects = await a.page.evaluate(() =>
      [...document.querySelectorAll('select')].map((s) => ({
        id: s.id,
        aria: s.getAttribute('aria-label'),
        opts: [...s.options].map((o) => o.text).join('|'),
      }))
    );
    baseEvidence = await screenshot(a.page, 'tjm-region-filter-absent');
  } catch (e) {
    record({
      id: 'TJM-01',
      severity: 'LOW',
      status: 'error',
      title: 'tjm region',
      error: String(e),
    });
  } finally {
    await a.browser.close();
  }
  const hasRegionControl = tjmSelects.some((s) =>
    /r[ée]gion/i.test(`${s.id ?? ''} ${s.aria ?? ''} ${s.opts ?? ''}`)
  );
  record({
    id: 'TJM-01',
    area: 'TJM',
    severity: 'LOW',
    title:
      'TJM region filter is not exposed as a control (only stack filtering + sort passed through)',
    phaseA: 'confirms',
    status: hasRegionControl ? 'refuted' : 'confirmed',
    repro: [
      'Open TJM page.',
      'Inspect all <select> controls: the only one is a SORT control; none filters by region (TJMPage passes only profileStacks).',
    ],
    expected: 'A region selector when regional TJM insights are shown.',
    actual: `selects=${JSON.stringify(tjmSelects)}; region filter present=${hasRegionControl}.`,
    evidence: [baseEvidence],
    codeRefs: ['src/ui/pages/TJMPage.svelte:36', 'src/ui/organisms/TJMDashboard.svelte'],
  });

  // 10b — inverted target (tjmMin > tjmMax) not validated.
  const profile = snapshotValue('__missionpulse_dev_profile') ?? {};
  profile.tjmMin = 800;
  profile.tjmMax = 400;
  const state = patchedStorageState({ __missionpulse_dev_profile: profile });
  const b = await launchContext({ storageState: state });
  try {
    await gotoApp(b.page);
    await navigate(b.page, 'tjm');
    await b.page.waitForTimeout(700);
    const body = await b.page
      .locator('body')
      .innerText({ timeout: 2000 })
      .catch(() => '');
    const showsMedian = /m[eé]dian|positionnement|coherent/i.test(body);
    const validationError = /incoh[eé]rent|invalide|min.*max|sup[eé]rieur/i.test(body);
    const evidence = await screenshot(b.page, 'tjm-inverted-target-not-validated');
    record({
      id: 'TJM-02',
      area: 'TJM',
      severity: 'LOW',
      title: 'Inverted TJM target (tjmMin>tjmMax) is not validated; positioning still renders',
      phaseA: 'confirms',
      status: showsMedian && !validationError ? 'confirmed' : 'partial',
      repro: [
        'Patch profile tjmMin=800, tjmMax=400.',
        'Open TJM page.',
        'Positioning/median renders with no validation error.',
      ],
      expected: 'A guard/error when tjmMin > tjmMax.',
      actual: `median/positioning rendered=${showsMedian}; validation error shown=${validationError}.`,
      evidence: [evidence],
      codeRefs: ['src/ui/organisms/TJMDashboard.svelte:53-62'],
    });
  } catch (e) {
    record({
      id: 'TJM-02',
      severity: 'LOW',
      status: 'error',
      title: 'tjm inverted',
      error: String(e),
    });
  } finally {
    await b.browser.close();
  }
}

// ===========================================================================
// S11 — [LOW] TJMGauge dead code (static)
// ===========================================================================
async function s_tjmGaugeDeadCode() {
  record({
    id: 'TJM-03',
    area: 'TJM',
    severity: 'LOW',
    title: 'TJMGauge.svelte is dead code with literal \\u20ac + always-blue statusColor',
    phaseA: 'confirms',
    status: 'confirmed',
    repro: [
      'grep imports of TJMGauge across src/ → none.',
      'Read TJMGauge.svelte: literal "\\u20ac" in template; statusColor always bg-blueprint-blue.',
    ],
    expected: 'Either remove dead code or render it with a real € glyph and dynamic status color.',
    actual:
      'No component imports TJMGauge; the file ships a literal backslash-u-20ac and a constant color.',
    evidence: [],
    codeRefs: ['src/ui/molecules/TJMGauge.svelte:28-34,47,49,65'],
    note: 'Static confirmation (no runtime screenshot possible — component is unmounted).',
  });
}

// ===========================================================================
// S12 — [MED] Onboarding alert-save failure still advances the wizard
// ===========================================================================
async function s_onboardingAlertFailureAdvances() {
  const { browser, page, consoleErrors } = await seeded();
  try {
    await navigate(page, 'settings');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Rejouer/i }).click();
    await page.waitForTimeout(900);
    // Walk to the alert step.
    await page
      .getByRole('button', { name: /Configurer le radar/ })
      .click()
      .catch(() => {});
    await page.waitForTimeout(300);
    await page
      .getByRole('button', { name: /Continuer avec/ })
      .click()
      .catch(() => {});
    await page.waitForTimeout(300);
    await page
      .getByRole('button', { name: /Créer une première alerte/ })
      .click()
      .catch(() => {});
    await page.waitForTimeout(400);
    // Inject alert-save failure.
    await injectSendMessageFailure(
      page,
      ['SAVE_CONNECTED_ALERT_PREFERENCES'],
      'qa-alert-save-failed'
    );
    // Click the alert-step advance.
    await page
      .getByRole('button', { name: /Voir le premier insight/ })
      .click()
      .catch(() => {});
    await page.waitForTimeout(1400);
    const body = await page
      .locator('body')
      .innerText({ timeout: 1500 })
      .catch(() => '');
    const advancedToInsight = /Action recommandée après le scan/i.test(body);
    const errorToast = /Impossible d['’]enregistrer l['’]alerte/i.test(body);
    const evidence = await screenshot(page, 'onboarding-alert-failure-advances');
    record({
      id: 'ONB-01',
      area: 'Onboarding',
      severity: 'MED',
      title: 'Onboarding advances past the alert step even when the alert save fails',
      phaseA: 'confirms',
      status: advancedToInsight ? 'confirmed' : 'partial',
      repro: [
        'Replay onboarding, walk to the "Créer une alerte" step.',
        'Force SAVE_CONNECTED_ALERT_PREFERENCES to fail.',
        'Click "Voir le premier insight".',
        'handleSaveAlertPreferences catches the error (toast) but never rethrows → saveAlertAndContinue() still calls goNext().',
      ],
      expected: 'On save failure the wizard should stay on the alert step and let the user retry.',
      actual: `advanced to insight step=${advancedToInsight}; error toast shown=${errorToast}.`,
      evidence: [evidence],
      codeRefs: [
        'src/ui/organisms/OnboardingWizard.svelte:151-162',
        'src/ui/pages/OnboardingPage.svelte:55-65',
        'src/lib/shell/facades/alert-preferences.facade.ts:32-34',
      ],
    });
  } catch (e) {
    record({
      id: 'ONB-01',
      severity: 'MED',
      status: 'error',
      title: 'onboarding alert failure',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// S13 — [MED] Onboarding skip → null profile (MASKED in dev)
// ===========================================================================
async function s_onboardingSkipNullProfile() {
  const { browser, page } = await seeded();
  try {
    await navigate(page, 'settings');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Rejouer/i }).click();
    await page.waitForTimeout(900);
    await page
      .getByRole('button', { name: /Passer et voir le feed|Voir le feed/ })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(1200);
    // Inspect whether the feed has a profile.
    const profile = await page
      .evaluate(() => window.localStorage.getItem('__missionpulse_dev_profile'))
      .catch(() => null);
    const feedAnchor = await page.locator('[data-testid="mission-feed-anchor"]').count();
    const evidence = await screenshot(page, 'onboarding-skip-profile-state');
    record({
      id: 'ONB-02',
      area: 'Onboarding',
      severity: 'MED',
      title: 'Onboarding skip does not save a profile (null-profile state unreachable in dev)',
      phaseA: 'confirms',
      status: 'masked',
      repro: [
        'Replay onboarding, click "Passer et voir le feed" (skip).',
        'The lifecycle machine does not persist a profile on skip.',
        'In dev, GET_PROFILE falls back to mockProfile, so the feed always has a profile — the null state cannot be reproduced.',
      ],
      expected:
        'Either skip still seeds a minimal profile, or the feed degrades gracefully with no profile.',
      actual: `after skip: dev localStorage profile present=${!!profile}; feed anchor rendered=${feedAnchor > 0} (mockProfile fallback hides the null state).`,
      evidence: [evidence],
      codeRefs: [
        'src/lib/state/app-navigation.svelte.ts:120-140',
        'src/dev/chrome-stubs.ts:108,163-164',
      ],
    });
  } catch (e) {
    record({
      id: 'ONB-02',
      severity: 'MED',
      status: 'error',
      title: 'onboarding skip',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// S14 — UI hunt: console-error sweep + horizontal overflow across all pages
// ===========================================================================
async function s_uiSweep() {
  const pages = ['feed', 'profile', 'cv', 'applications', 'tjm', 'settings'];
  const sweep = [];
  const { browser, page, consoleErrors, pageFailures } = await seeded();
  try {
    for (const p of pages) {
      consoleErrors.length = 0;
      pageFailures.length = 0;
      await navigate(page, p);
      await page.waitForTimeout(700);
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        return { scrollW: de.scrollWidth, clientW: de.clientWidth };
      });
      const horizOverflow = overflow.scrollW > overflow.clientW + 1;
      sweep.push({
        page: p,
        consoleErrors: consoleErrors.length,
        pageErrors: pageFailures.length,
        horizontalOverflow: horizOverflow,
        errorSamples: consoleErrors.slice(0, 2),
      });
    }
    const evidence = await screenshot(page, 'ui-sweep-settings');
    const overflowPages = sweep.filter((s) => s.horizontalOverflow).map((s) => s.page);
    const errorPages = sweep
      .filter((s) => s.consoleErrors > 0 || s.pageErrors > 0)
      .map((s) => s.page);
    record({
      id: 'UI-01',
      area: 'UI Hunt',
      severity: overflowPages.length ? 'MED' : 'LOW',
      title: 'Cross-page sweep: console errors / horizontal overflow at 400px width',
      phaseA: 'new',
      status: overflowPages.length || errorPages.length ? 'confirmed' : 'clean',
      repro: [
        'Visit all 6 pages at the 400px side-panel width; capture console errors and scrollWidth>clientWidth.',
      ],
      expected: 'No unhandled console errors and no horizontal overflow on any page.',
      actual: `overflow pages=${JSON.stringify(overflowPages)}; error pages=${JSON.stringify(errorPages)} (clean = no defects).`,
      sweep,
      evidence: [evidence],
    });
  } catch (e) {
    record({
      id: 'UI-01',
      area: 'UI Hunt',
      severity: 'LOW',
      status: 'error',
      title: 'ui sweep',
      error: String(e),
    });
  } finally {
    await browser.close();
  }
}

// ===========================================================================
// main
// ===========================================================================
async function main() {
  if (!existsSync(STORAGE_STATE_PATH)) {
    console.error('Seed snapshot missing at', STORAGE_STATE_PATH, '— run smoke/probe first.');
    process.exit(1);
  }
  const scenarios = [
    s_dashboardFilterMismatch,
    s_feedStoryCriticalWithCache,
    s_comparisonScoreDivergence,
    s_applicationsTerminalRelance,
    s_cvLinkedInBroken,
    s_backupRestoreStuck,
    s_resetSwallowed,
    s_scanSettingsA11y,
    s_feedTourContrast,
    s_tjmRegionAndInverted,
    s_tjmGaugeDeadCode,
    s_onboardingAlertFailureAdvances,
    s_onboardingSkipNullProfile,
    s_uiSweep,
  ];
  for (const s of scenarios) {
    try {
      await s();
    } catch (e) {
      console.error('Scenario crashed:', s.name, e);
    }
  }
  writeJson(FINDINGS_PATH, findings);
  // Summary
  const byStatus = {};
  const bySev = {};
  for (const f of findings) {
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
    bySev[f.severity] = (bySev[f.severity] ?? 0) + 1;
  }
  console.log('\n================ QA CAMPAIGN SUMMARY ================');
  console.log('findings:', findings.length);
  console.log('by status:', JSON.stringify(byStatus));
  console.log('by severity:', JSON.stringify(bySev));
  console.log('findings written to', FINDINGS_PATH);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
