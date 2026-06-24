import { defineConfig, configDefaults } from 'vitest/config';

// Два проекта различаются только значением compile-time флага DEV (esbuild define):
// прод-ветки кода тестируются с DEV=false (как в релизе), а dev-only ветки
// (например, эмуляция даты отсечки в analyzeNewContent) — отдельным проектом с DEV=true.
// DEV статически подставляется при трансформе, поэтому переключить его в рантайме нельзя —
// нужен отдельный прогон. Dev-тесты лежат в файлах *.dev.test.js.
export default defineConfig({
  test: {
    projects: [
      {
        define: { DEV: 'false' },
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          include: ['**/*.test.js'],
          exclude: [...configDefaults.exclude, '**/*.dev.test.js'],
        },
      },
      {
        define: { DEV: 'true' },
        test: {
          name: 'unit-dev',
          environment: 'jsdom',
          globals: true,
          include: ['**/*.dev.test.js'],
        },
      },
    ],
  },
});
