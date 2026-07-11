import { afterEach, describe, expect, it } from 'vitest';
import { extractLinkedInProfileFromDom } from '../../../src/lib/shell/profile-extractors/linkedin.extractor';

type DomSnapshot = ReturnType<typeof extractLinkedInProfileFromDom>;

function renderProfile(bodyHtml: string): void {
  document.body.innerHTML = bodyHtml;
}

const PROFILE_WITH_CHALLENGE_IN_BIO = `
<main>
  <h1>Jane Doe</h1>
</main>
<section>
  <h2>About</h2>
  <p>Frontend engineer who thrives on new challenges and ambiguous problems.</p>
</section>
<section>
  <h2>Experience</h2>
  <ul>
    <li>Lead Frontend\nScaleOps\n2020 — 2024\nParis</li>
  </ul>
</section>
`;

describe('extractLinkedInProfileFromDom — blocked-reason detection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not block when a real profile mentions "challenge" in its About section', () => {
    renderProfile(PROFILE_WITH_CHALLENGE_IN_BIO);

    const snapshot: DomSnapshot = extractLinkedInProfileFromDom();

    expect(snapshot.blockedReason).toBeUndefined();
    // Headline + an experience section prove real profile sections were found,
    // which is what the `hasProfileSections` guard keys on. (Line-level parsing
    // of each <li> relies on `innerText` and is covered by the parser tests.)
    expect(snapshot.sections.headline).toBe('Jane Doe');
    expect(snapshot.sections.experiences).toHaveLength(1);
  });

  it('does not block on "unusual activity" when real profile sections are present', () => {
    renderProfile(`
      <main><h1>Jane Doe</h1></main>
      <section>
        <h2>About</h2>
        <p>I investigate unusual activity in distributed systems.</p>
      </section>
      <section>
        <h2>Experience</h2>
        <ul><li>SRE\nAcme\n2019 — 2024</li></ul>
      </section>
    `);

    const snapshot: DomSnapshot = extractLinkedInProfileFromDom();

    expect(snapshot.blockedReason).toBeUndefined();
    expect(snapshot.sections.experiences).toHaveLength(1);
  });

  it('does not block corroboration-like biography prose below a genuine profile h1', () => {
    renderProfile(`
      <main>
        <h1>Jane Doe</h1>
        <p>I investigate unusual activity and help customers verify your identity safely.</p>
      </main>
    `);

    const snapshot: DomSnapshot = extractLinkedInProfileFromDom();

    expect(snapshot.blockedReason).toBeUndefined();
    expect(snapshot.sections.headline).toBe('Jane Doe');
  });

  it('blocks when LinkedIn serves a security-verification interstitial with no profile sections', () => {
    renderProfile(`
      <div>
        <h1>Security verification</h1>
        <p>Let's do a quick security check. Please verify your identity.</p>
      </div>
    `);

    const snapshot: DomSnapshot = extractLinkedInProfileFromDom();

    expect(snapshot.blockedReason).toBe('security verification required');
    expect(snapshot.sections.experiences).toHaveLength(0);
    expect(snapshot.sections.headline).toBe('');
  });

  it('does not let a challenge phrase in a profile-headline selector suppress blocking', () => {
    renderProfile(`
      <main>
        <div class="pv-text-details__left-panel">
          <p class="text-body-medium">Security verification</p>
        </div>
        <p>Please verify your identity to continue.</p>
      </main>
    `);

    const snapshot: DomSnapshot = extractLinkedInProfileFromDom();

    expect(snapshot.blockedReason).toBe('security verification required');
    expect(snapshot.sections.headline).toBe('');
  });

  it('prioritizes a corroborated challenge h1 over residual profile headline markup', () => {
    renderProfile(`
      <main>
        <h1>Security verification</h1>
        <div class="pv-text-details__left-panel">
          <p class="text-body-medium">Principal Security Engineer</p>
        </div>
        <p>Please verify your identity to continue.</p>
      </main>
    `);

    const snapshot: DomSnapshot = extractLinkedInProfileFromDom();

    expect(snapshot.blockedReason).toBe('security verification required');
    expect(snapshot.sections.headline).toBe('');
  });

  it('keeps an uncorroborated Security verification h1 as a legitimate headline', () => {
    renderProfile('<main><h1>Security verification</h1></main>');

    const snapshot: DomSnapshot = extractLinkedInProfileFromDom();

    expect(snapshot.blockedReason).toBeUndefined();
    expect(snapshot.sections.headline).toBe('Security verification');
  });

  it('preserves a genuine headline that only contains challenge vocabulary', () => {
    renderProfile(`
      <main><h1>Security Check Engineer</h1></main>
      <section>
        <h2>Experience</h2>
        <ul><li>SRE\nAcme\n2021 — 2024</li></ul>
      </section>
    `);

    const snapshot: DomSnapshot = extractLinkedInProfileFromDom();

    expect(snapshot.blockedReason).toBeUndefined();
    expect(snapshot.sections.headline).toBe('Security Check Engineer');
  });

  it('does not treat the bare word "checkpoint" in profile prose as a block signal', () => {
    renderProfile(`
      <main><h1>Jane Doe</h1></main>
      <section>
        <h2>Experience</h2>
        <ul><li>PM\nAcme\n2021 — 2024\nRan the quarterly project checkpoint</li></ul>
      </section>
    `);

    const snapshot: DomSnapshot = extractLinkedInProfileFromDom();

    expect(snapshot.blockedReason).toBeUndefined();
    expect(snapshot.sections.experiences).toHaveLength(1);
  });
});
