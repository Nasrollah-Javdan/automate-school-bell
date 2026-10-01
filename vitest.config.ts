import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default']
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@i18n': resolve(__dirname, 'src/i18n/index.ts'),
      '@types': resolve(__dirname, 'src/types/index.ts')
    }
  }
})