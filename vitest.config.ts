import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'better-sqlite3-multiple-ciphers': path.resolve(__dirname, './test-mocks/better-sqlite3.ts'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
})
