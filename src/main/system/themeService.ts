import { nativeTheme, type NativeTheme } from 'electron'
import type { ThemeMode } from '../../types/index.js'

type Listener = (effectiveDark: boolean) => void

/**
 * Keeps the Windows theme and the interface in sync.
 * `system` follows the OS, light/dark are forced.
 */
export class ThemeService {
  private readonly listeners = new Set<Listener>()

  constructor(private readonly theme: NativeTheme = nativeTheme) {
    this.theme.on('updated', () => this.emit())
  }

  apply(mode: ThemeMode): void {
    this.theme.themeSource = mode
  }

  isDark(): boolean {
    return this.theme.shouldUseDarkColors
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    const dark = this.isDark()
    for (const listener of this.listeners) listener(dark)
  }
}
