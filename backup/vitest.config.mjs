import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Constitution principle 6: line coverage >= 80% on changed code.
      // With a threshold the run fails instead of only reporting the number.
      thresholds: { lines: 80 },
    },
  },
});
