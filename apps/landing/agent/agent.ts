import { defineAgent } from 'eve';

export default defineAgent({
  // The copilot answers in text only: no filesystem, network or shell access.
  defaultTools: false,
  model: 'anthropic/claude-sonnet-5',
  // Eve does not resolve this catalog entry during local compilation.
  // Vercel AI Gateway publishes a 1,000,000-token context window for this model.
  modelContextWindowTokens: 1_000_000,
  reasoning: 'low',
  limits: {
    // Count new input only: cache reads are the history the provider replays.
    sessionUsage: ({ window }) =>
      window.inputTokens - window.cacheReadTokens >= 32_000 || window.outputTokens >= 8_000,
  },
});
