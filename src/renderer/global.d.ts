import type { MainApi } from '../types/index.js'

declare global {
  interface Window {
    api: MainApi
  }
}

export {}