import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

interface ListFilesOptions {
  cwd?: string;
  extensions?: readonly string[];
}

function normalizePath(path: string): string {
  return path.split(sep).join('/');
}

export function listFiles(roots: readonly string[], options: ListFilesOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const extensions = options.extensions;
  const files: string[] = [];

  function visit(directory: string) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    );

    for (const entry of entries) {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (extensions && !extensions.some((extension) => entry.name.endsWith(extension))) {
        continue;
      }

      files.push(normalizePath(relative(cwd, entryPath)));
    }
  }

  for (const root of roots) {
    visit(join(cwd, root));
  }

  return files;
}
