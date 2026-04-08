/**
 * Pure browser compatibility detection for MissionPulse
 *
 * FC&IS: This is pure Core — NO I/O, NO async, NO Date.now(), NO chrome.*
 * All non-determinism (userAgent string) is injected as a parameter.
 */

/**
 * Detected browser information and capabilities
 */
export interface BrowserInfo {
  /** Detected browser name */
  name: 'chrome' | 'edge' | 'brave' | 'arc' | 'dia' | 'opera' | 'vivaldi' | 'unknown';
  /** Major version number */
  version: number;
  /** Whether this is a Chromium-based browser */
  isChromium: boolean;
  /** Whether credentials:'include' reliably forwards cookies from extension context */
  credentialsReliable: boolean;
  /** Whether cookie partitioning may affect chrome.cookies.getAll() */
  cookiePartitioningRisk: boolean;
}

/**
 * Regex patterns for browser detection from User-Agent string
 */
const BROWSER_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  name: BrowserInfo['name'];
  versionGroup: number;
}> = [
  // Arc/Dia (The Browser Company) - check first as it may include Chrome
  { pattern: /\bArc\/(\d+(?:\.\d+)?)/, name: 'arc', versionGroup: 1 },
  { pattern: /\bDia\/(\d+(?:\.\d+)?)/, name: 'dia', versionGroup: 1 },
  // Edge - check before Chrome as it includes Chrome
  { pattern: /\bEdg(?:e|A|iOS)?\/(\d+(?:\.\d+)?)/, name: 'edge', versionGroup: 1 },
  // Opera - check before Chrome as it includes Chrome
  { pattern: /\bOPR(?:\/|(\d+(?:\.\d+)?))?/, name: 'opera', versionGroup: 1 },
  { pattern: /\bOpera(?:\/|\s+)(\d+(?:\.\d+)?)/, name: 'opera', versionGroup: 1 },
  // Vivaldi - check before Chrome as it includes Chrome
  { pattern: /\bVivaldi\/(\d+(?:\.\d+)?)/, name: 'vivaldi', versionGroup: 1 },
  // Brave - often hidden, but check anyway
  { pattern: /\bBrave(?:\/(\d+(?:\.\d+)?))?/, name: 'brave', versionGroup: 1 },
  // Chrome - catch-all for Chromium browsers not matched above
  { pattern: /\bChrome\/(\d+(?:\.\d+)?)/, name: 'chrome', versionGroup: 1 },
];

/**
 * Chromium signature in User-Agent
 */
const CHROMIUM_PATTERN = /\bChrom(?:e|ium)\/\d+/;

/**
 * Detects browser from userAgent string (pure function)
 *
 * @param userAgent - The navigator.userAgent string (injected for purity)
 * @returns BrowserInfo with detected browser and capability flags
 *
 * @example
 * const info = detectBrowser(navigator.userAgent);
 * if (!info.credentialsReliable) {
 *   // Use explicit cookie injection
 * }
 */
export const detectBrowser = (userAgent: string): BrowserInfo => {
  // Guard against null/undefined (defensive, since callers may pass navigator.userAgent which is always string)
  if (!userAgent) {
    return {
      name: 'unknown',
      version: 0,
      isChromium: false,
      credentialsReliable: false,
      cookiePartitioningRisk: true,
    };
  }
  const ua = userAgent;

  // Try each browser pattern in order
  for (const { pattern, name, versionGroup } of BROWSER_PATTERNS) {
    const match = ua.match(pattern);
    if (match) {
      const version = parseVersion(match[versionGroup] ?? '0');
      const isChromium = CHROMIUM_PATTERN.test(ua);

      // Only Chrome has reliable credentials forwarding in extension context
      // All other browsers (even Chromium-based) may have issues
      const credentialsReliable = name === 'chrome';

      // Non-Chrome browsers may have cookie partitioning that affects getAll()
      const cookiePartitioningRisk = name !== 'chrome';

      return {
        name,
        version,
        isChromium,
        credentialsReliable,
        cookiePartitioningRisk,
      };
    }
  }

  // Unknown browser - be conservative
  // If it has Chromium signature, treat as unknown Chromium
  const isChromium = CHROMIUM_PATTERN.test(ua);
  const chromeMatch = ua.match(/\bChrome\/(\d+(?:\.\d+)?)/);
  const version = chromeMatch ? parseVersion(chromeMatch[1]) : 0;

  return {
    name: 'unknown',
    version,
    isChromium,
    credentialsReliable: false,
    cookiePartitioningRisk: true,
  };
};

/**
 * Determines if explicit cookie injection via declarativeNetRequest is needed
 *
 * @param browser - BrowserInfo from detectBrowser()
 * @returns true if cookie injection should be used
 */
export const needsExplicitCookieInjection = (browser: BrowserInfo): boolean =>
  !browser.credentialsReliable;

/**
 * Determines if Origin header rewriting is needed
 *
 * Chrome extensions send `chrome-extension://...` as the Origin header,
 * which many APIs reject as an invalid origin. ALL Chromium browsers
 * have this issue when running as an extension.
 *
 * Non-Chromium browsers (Firefox) don't run this MV3 extension,
 * so we return false for them (they won't be encountered in practice).
 *
 * @param browser - BrowserInfo from detectBrowser()
 * @returns true if Origin rewriting should be used (all Chromium browsers)
 */
export const needsOriginRewrite = (browser: BrowserInfo): boolean => browser.isChromium;

/**
 * Parses a version string into a major version number
 *
 * @param versionStr - Version string like "120.0.6099.109"
 * @returns Major version number (e.g., 120)
 */
const parseVersion = (versionStr: string): number => {
  const parts = versionStr.split('.');
  const major = parseInt(parts[0] ?? '0', 10);
  return Number.isNaN(major) ? 0 : major;
};
