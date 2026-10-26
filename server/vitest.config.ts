import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Fastify request logs are noise in test output; failures still print.
    env: { LOG_LEVEL: 'silent' },
  },
});
