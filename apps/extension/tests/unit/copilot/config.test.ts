import { describe, expect, it } from 'vitest';

import { resolveCopilotOrigins } from '../../../src/lib/shell/copilot/config';

describe('Copilot account and cookieless API origins', () => {
  it('defaults and fails closed to distinct production HTTPS origins', () => {
    expect(resolveCopilotOrigins(undefined, undefined, false)).toEqual({
      accountOrigin: 'https://missionpulse.app',
      apiOrigin: 'https://copilot.missionpulse.app',
    });
    expect(
      resolveCopilotOrigins('https://user:secret@example.com', 'http://api.example.com', false)
    ).toEqual({
      accountOrigin: 'https://missionpulse.app',
      apiOrigin: 'https://copilot.missionpulse.app',
    });
    expect(
      resolveCopilotOrigins('https://same.example.com', 'https://same.example.com', false)
    ).toEqual({
      accountOrigin: 'https://missionpulse.app',
      apiOrigin: 'https://copilot.missionpulse.app',
    });
  });

  it('allows HTTP only for loopback during development', () => {
    expect(resolveCopilotOrigins('http://localhost:3000', 'http://127.0.0.1:54321', true)).toEqual({
      accountOrigin: 'http://localhost:3000',
      apiOrigin: 'http://127.0.0.1:54321',
    });
    expect(resolveCopilotOrigins(undefined, 'http://localhost:3000', false).apiOrigin).toBe(
      'https://copilot.missionpulse.app'
    );
  });
});
