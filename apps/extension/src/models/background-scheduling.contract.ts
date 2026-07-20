export interface AutomaticScanConsentFacts {
  readonly onboardingCompleted: boolean;
  readonly autoScan: boolean;
}

/**
 * Executable projection of invariant 6 from background-scheduling.model.md.
 *
 * The Shell supplies facts read from the canonical onboarding and settings
 * authorities. This pure predicate is the only place that decides whether an
 * automatic scan may be admitted.
 */
export function automaticScanConsentAuthorized(facts: AutomaticScanConsentFacts): boolean {
  return facts.onboardingCompleted === true && facts.autoScan === true;
}
