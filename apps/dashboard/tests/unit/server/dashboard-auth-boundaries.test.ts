import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  current: null as { auth: { getSession: ReturnType<typeof vi.fn> } } | null,
}));

vi.mock('../../../src/lib/server/supabase', () => ({
  createSupabaseServerClient: vi.fn(() => {
    if (!supabaseMock.current) {
      throw new Error('Supabase auth boundary mock not configured.');
    }

    return supabaseMock.current;
  }),
}));

vi.mock('$env/dynamic/public', () => ({
  env: {
    PUBLIC_SUPABASE_URL: 'https://supabase.example',
    PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    PUBLIC_LANDING_URL: 'https://missionpulse.example',
  },
}));

function readSourceFiles(directory: string): Array<{ path: string; content: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return readSourceFiles(absolutePath);
    }

    if (!entry.isFile() || !/\.(svelte|ts)$/.test(entry.name)) {
      return [];
    }

    return [{ path: absolutePath, content: readFileSync(absolutePath, 'utf8') }];
  });
}

describe('dashboard auth and platform-session boundaries', () => {
  it('redirects unauthenticated users to the landing login when Supabase is configured', async () => {
    supabaseMock.current = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null } })),
      },
    };

    const { load } = await import('../../../src/routes/+page.server');

    await expect(load({ cookies: {} } as Parameters<typeof load>[0])).rejects.toMatchObject({
      status: 303,
      location: 'https://missionpulse.example/login?redirectTo=%2Fdashboard',
    });
  });

  it('keeps platform session access out of the dashboard source tree', () => {
    const dashboardSrc = join(process.cwd(), 'src');
    const files = readSourceFiles(dashboardSrc);
    const forbiddenRuntimePatterns = [
      /\bchrome\.(cookies|tabs|runtime|scripting|permissions)\b/,
      /\bbrowser\.(cookies|tabs|runtime|scripting|permissions)\b/,
      /\bdocument\.cookie\b/,
      /\bindexedDB\b/,
    ];
    const forbiddenPlatformFetchPatterns = [
      /\bfetch\s*\(\s*['"`]https:\/\/(?:www\.)?linkedin\.com\b/,
      /\bfetch\s*\(\s*['"`]https:\/\/(?:www\.)?free-work\.com\b/,
      /\bfetch\s*\(\s*['"`]https:\/\/(?:www\.)?lehibou\.com\b/,
      /\bfetch\s*\(\s*['"`]https:\/\/(?:www\.)?hiway\.fr\b/,
      /\bfetch\s*\(\s*['"`]https:\/\/(?:www\.)?app\.comet\.co\b/,
    ];

    const violations = files.flatMap((file) => {
      const allPatterns = [...forbiddenRuntimePatterns, ...forbiddenPlatformFetchPatterns];
      return allPatterns
        .filter((pattern) => pattern.test(file.content))
        .map((pattern) => `${relative(process.cwd(), file.path)} matches ${pattern.source}`);
    });

    expect(violations).toEqual([]);
  });
});
