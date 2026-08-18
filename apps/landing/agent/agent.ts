import { defineAgent } from 'eve';

export default defineAgent({
  model: 'anthropic/claude-sonnet-5',
  // Eve does not resolve this catalog entry during local compilation.
  // Vercel AI Gateway publishes a 1,000,000-token context window for this model.
  modelContextWindowTokens: 1_000_000,
  reasoning: 'low',
  limits: {
    maxInputTokensPerSession: 32_000,
    maxOutputTokensPerSession: 8_000,
  },
});
