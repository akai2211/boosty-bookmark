import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { DEV: 'false' },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.test.js'],
  },
});
