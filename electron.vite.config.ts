import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@i18n': resolve(__dirname, 'src/i18n/index.ts'),
  '@types': resolve(__dirname, 'src/types/index.ts')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    },
    resolve: { alias }
  },
  /*
   * A single preload bundle is used by both windows: a sandboxed preload
   * script cannot `require` shared chunks, and the audio host page never
   * touches `window.api`.
   */
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    },
    resolve: { alias }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          audioHost: resolve(__dirname, 'src/renderer/audio-host.html')
        }
      }
    },
    resolve: {
      alias: {
        ...alias,
        '@': resolve(__dirname, 'src/renderer')
      }
    }
  }
})