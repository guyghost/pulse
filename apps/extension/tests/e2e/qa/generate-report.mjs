// Generates reports/qa/qa-runner-bugs.md from /tmp/qa-findings.json.
// Not picked up by the Playwright runner. Driven by `node tests/e2e/qa/generate-report.mjs`.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const findings = JSON.parse(readFileSync('/tmp/qa-findings.json', 'utf8'));
const REPORT = '/Users/guy/Developer/dev/pulse/reports/qa/qa-runner-bugs.md';
const SHOTS_REL = 'screenshots'; // relative to reports/qa/

const SEV_ORDER = { HIGH: 0, MED: 1, LOW: 2 };
const ordered = [...findings].sort(
  (a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9) || (a.id < b.id ? -1 : 1)
);

const statusLabel = {
  confirmed: 'CONFIRMED',
  masked: 'DEV-MASKED',
  clean: 'NO DEFECT',
  partial: 'PARTIAL',
  refuted: 'REFUTED',
  error: 'ERROR',
};

function esc(s) {
  return String(s ?? '').replace(/\|/g, '\\|');
}

let md = '';
md += '# MissionPulse — Phase B Interactive QA: Confirmed Bugs\n\n';
md += '`reports/qa/qa-runner-bugs.md` — produced by the `qa-runner` agent (Phase B).\n\n';
md +=
  'Environment: Vite dev server (port 5176, PID 23083), target `http://localhost:5176/src/sidepanel/index.html`, ';
md += 'Playwright 1.59.1 (headless Chromium), 400x760 side-panel viewport. ';
md +=
  'Seeded via the DevPanel "Inject QA seed (500)" path (~500 missions, full profile, healthy/degraded/broken connectors, 9 trackings across all statuses), snapshotted to a reusable `storageState`. ';
md +=
  'Each scenario boots an isolated context; failure paths are exercised by wrapping `chrome.runtime.sendMessage` to reject on chosen message types. ';
md +=
  'No destructive actions were executed (the reset confirmation was armed but NOT confirmed), no source changes, no commits/PRs.\n\n';

// Summary counts
const counts = { confirmed: 0, masked: 0, clean: 0, partial: 0, refuted: 0 };
const bySev = { HIGH: 0, MED: 0, LOW: 0 };
for (const f of findings) {
  counts[f.status] = (counts[f.status] ?? 0) + 1;
  bySev[f.severity] = (bySev[f.severity] ?? 0) + 1;
}
md += '## Summary\n\n';
md += `- Findings: ${findings.length}\n`;
md += `- Confirmed bugs: ${counts.confirmed} (HIGH ${bySev.HIGH}, MED ${bySev.MED}, LOW ${bySev.LOW})\n`;
md += `- Dev-masked (code defect real, unreachable in dev): ${counts.masked}\n`;
md += `- No-defect (clean sweep): ${counts.clean}\n\n`;
md +=
  'Severity counts among confirmed bugs: HIGH=' +
  bySev.HIGH +
  ', MED=' +
  bySev.MED +
  ', LOW=' +
  bySev.LOW +
  '.\n\n';

md +=
  'Status legend: CONFIRMED = reproduced live; DEV-MASKED = code defect confirmed but the dev stub hides the symptom; NO DEFECT = swept and clean.\n\n';

md += '## Confirmed bugs (by severity)\n\n';
for (const f of ordered.filter((x) => x.status === 'confirmed')) {
  md += renderFinding(f);
}

md += '\n## Dev-masked defect\n\n';
for (const f of ordered.filter((x) => x.status === 'masked')) {
  md += renderFinding(f);
}

md += '\n## No-defect sweep\n\n';
for (const f of ordered.filter((x) => x.status === 'clean')) {
  md += renderFinding(f);
}

function renderFinding(f) {
  let s = '';
  s += `### ${f.id} — [${f.severity}] ${f.title}\n\n`;
  s += `- Status: **${statusLabel[f.status] ?? f.status}** · Phase A: **${f.phaseA ?? '—'}** · Area: ${f.area}\n`;
  if (f.note) s += `- Note: ${f.note}\n`;
  s += `\n**Reproduction:**\n`;
  for (let i = 0; i < (f.repro ?? []).length; i++) s += `${i + 1}. ${f.repro[i]}\n`;
  s += `\n**Expected:** ${f.expected ?? '—'}\n\n`;
  s += `**Actual:** ${f.actual ?? '—'}\n`;
  if (f.codeRefs?.length) {
    s += `\n**Code:** ${f.codeRefs.map((c) => '`' + c + '`').join(', ')}\n`;
  }
  if (f.evidence?.length) {
    s += `\n**Evidence:**\n`;
    for (const e of f.evidence) {
      const name = e.split('/').pop();
      s += `- ![${name}](${SHOTS_REL}/${name}) (\`${SHOTS_REL}/${name}\`)\n`;
    }
  }
  if (f.consoleErrors?.length) {
    s += `\n**Console samples:**\n`;
    for (const c of f.consoleErrors) s += `  - \`${esc(c).slice(0, 200)}\`\n`;
  }
  if (f.sweep?.length) {
    s += `\n**Per-page sweep:**\n`;
    for (const r of f.sweep)
      s += `  - ${r.page}: consoleErrors=${r.consoleErrors}, pageErrors=${r.pageErrors}, horizontalOverflow=${r.horizontalOverflow}\n`;
  }
  s += `\n`;
  return s;
}

md += '---\n\n';
md += '## Reproducing this run\n\n';
md += '```bash\n';
md += '# dev server (strictPort 5176)\n';
md += 'cd apps/extension && pnpm dev\n';
md += '# build the QA seed snapshot once (via DevPanel inject + reload), then:\n';
md += 'node tests/e2e/qa/smoke.mjs     # boots + builds /tmp/qa-storage-state.json\n';
md += 'node tests/e2e/qa/run-qa.mjs    # all scenarios -> /tmp/qa-findings.json + screenshots/\n';
md += 'node tests/e2e/qa/generate-report.mjs\n';
md += '```\n\n';
md +=
  'Harness & scenarios live under `apps/extension/tests/e2e/qa/` (no `*.test.*` suffix, so the Playwright runner ignores them).\n';

writeFileSync(REPORT, md);
console.log('wrote', REPORT, '(' + md.length + ' bytes)');
console.log(
  'confirmed=' + counts.confirmed + ' masked=' + counts.masked + ' clean=' + counts.clean
);
