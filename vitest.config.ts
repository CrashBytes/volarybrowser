import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    pool: 'vmThreads',
    alias: {
      'better-sqlite3-multiple-ciphers': path.resolve(__dirname, 'test-mocks/better-sqlite3.ts'),
    },
  },
})
