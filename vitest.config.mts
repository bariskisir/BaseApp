import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: {
    decorator: {
      legacy: true,
    },
  },
  resolve: {
    alias: {
      '@app': resolve('src/app'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/app/**/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/app/**/*.ts'],
      exclude: [
        'src/app/**/test/**',
        'src/app/code/electron-browser/entry.ts',
        'src/app/code/electron-main/index.ts',
      ],
    },
  },
})
