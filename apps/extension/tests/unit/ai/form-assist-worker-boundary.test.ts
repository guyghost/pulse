import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('form assistance AI worker boundary', () => {
  const workerSource = readFileSync('src/lib/shell/ai/form-assist.worker.ts', 'utf8');
  const clientSource = readFileSync('src/lib/shell/ai/form-assist-worker-client.ts', 'utf8');
  const orchestratorSource = readFileSync('src/lib/shell/ai/form-assist.ts', 'utf8');

  it('runs suggestions through a dedicated module worker', () => {
    expect(clientSource).toContain('new Worker(');
    expect(clientSource).toContain('form-assist.worker.ts');
    expect(orchestratorSource).toContain("from './form-assist-worker-client'");
    expect(orchestratorSource).not.toContain("from './form-assist-worker-core'");
  });

  it('keeps state machines, storage, DOM mutation and submission out of the AI worker', () => {
    expect(workerSource).not.toContain('xstate');
    expect(workerSource).not.toContain('chrome.storage');
    expect(workerSource).not.toContain('chrome.scripting');
    expect(workerSource).not.toMatch(/requestSubmit|\.submit\s*\(/);
    expect(orchestratorSource).not.toMatch(/requestSubmit|\.submit\s*\(/);
  });
});
