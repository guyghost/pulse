/**
 * Build-time connector resolution.
 *
 * Pure function: deterministic given (allIds, config, env). No I/O, no Date,
 * no Math.random. The JSON file read is performed by the thin caller
 * (`loadConnectorConfig`) so the core resolver stays mock-free testable.
 *
 * See: apps/extension/src/models/connector-build-config.model.md
 */

export interface ConnectorConfig {
  include?: string[];
  exclude?: string[];
}

export interface ConnectorEnv {
  CONNECTORS_INCLUDE?: string;
  CONNECTORS_EXCLUDE?: string;
}

export interface ResolveInput {
  allIds: readonly string[];
  config?: ConnectorConfig;
  env?: ConnectorEnv;
}

export type ResolveSource = 'include-env' | 'exclude-env' | 'include-file' | 'exclude-file' | 'all';

export interface ResolveOutput {
  included: string[];
  excluded: string[];
  warnings: string[];
  source: ResolveSource;
}

/**
 * Parse a comma-separated env var into a trimmed, de-duplicated list of
 * non-empty tokens.
 */
export function parseIdList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(',')) {
    const trimmed = token.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Resolve which connector IDs a given build must ship.
 *
 * Precedence (highest first):
 *   1. CONNECTORS_INCLUDE env var (absolute include list)
 *   2. config.include
 *   3. CONNECTORS_EXCLUDE env var (subtracts from allIds)
 *   4. config.exclude
 *   5. allIds (ship everything)
 *
 * Include sources win over exclude sources. Env wins over file.
 */
export function resolveIncludedConnectors({ allIds, config, env }: ResolveInput): ResolveOutput {
  const cfg = config ?? {};
  const environment = env ?? {};

  const includeEnv = parseIdList(environment.CONNECTORS_INCLUDE);
  const excludeEnv = parseIdList(environment.CONNECTORS_EXCLUDE);
  const includeFile = Array.isArray(cfg.include) ? cfg.include : [];
  const excludeFile = Array.isArray(cfg.exclude) ? cfg.exclude : [];

  const allSet = new Set(allIds);
  const warnings: string[] = [];

  const collectWarnings = (ids: readonly string[]): void => {
    for (const id of ids) {
      if (!allSet.has(id)) {
        warnings.push(`Unknown connector id: "${id}"`);
      }
    }
  };

  let candidate: readonly string[];
  let source: ResolveSource;

  if (includeEnv.length > 0) {
    candidate = includeEnv;
    source = 'include-env';
  } else if (includeFile.length > 0) {
    candidate = includeFile;
    source = 'include-file';
  } else if (excludeEnv.length > 0) {
    const drop = new Set(excludeEnv);
    candidate = allIds.filter((id) => !drop.has(id));
    source = 'exclude-env';
  } else if (excludeFile.length > 0) {
    const drop = new Set(excludeFile);
    candidate = allIds.filter((id) => !drop.has(id));
    source = 'exclude-file';
  } else {
    candidate = allIds;
    source = 'all';
  }

  collectWarnings(includeEnv);
  collectWarnings(excludeEnv);
  collectWarnings(includeFile);
  collectWarnings(excludeFile);

  // Preserve allIds ordering; drop any candidate id not in allIds.
  const includedSet = new Set(candidate);
  const included = allIds.filter((id) => includedSet.has(id));
  const excluded = allIds.filter((id) => !includedSet.has(id));

  return { included, excluded, warnings, source };
}

export interface LoadResult extends ResolveOutput {
  configLoaded: boolean;
}

/**
 * Thin I/O wrapper: reads `connectors.config.json` from disk, then calls the
 * pure resolver. Used by verify-manifest.ts and other build scripts that
 * prefer async fs. vite.config.ts reads the file synchronously instead.
 */
export async function loadConnectorConfig({
  allIds,
  configPath,
  env,
}: {
  allIds: readonly string[];
  configPath: string;
  env?: ConnectorEnv;
}): Promise<LoadResult> {
  const { readFile } = await import('node:fs/promises');
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch {
    return {
      ...resolveIncludedConnectors({ allIds, config: {}, env }),
      configLoaded: false,
    };
  }
  let parsed: ConnectorConfig = {};
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(raw) as ConnectorConfig;
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
  }
  const result = resolveIncludedConnectors({
    allIds,
    config: parseError ? {} : parsed,
    env,
  });
  if (parseError) {
    result.warnings = [`connectors.config.json parse error: ${parseError}`, ...result.warnings];
  }
  return { ...result, configLoaded: parseError === null };
}
