import { spawn, type ChildProcess } from 'node:child_process'
import { AudioError } from '../../shared/audioPlayer.js'
import { soundExtension } from '../storage/soundLibrary.js'

/**
 * Native Windows playback, running outside Chromium.
 *
 * Why this exists
 * ---------------
 * The embedded player (`<audio>` in a hidden BrowserWindow) depends on the
 * Chromium audio stack. On school Windows machines that stack is the flaky
 * part: the audio service can fail to open an output stream for a window that
 * is never shown, and when it does nothing is reported anywhere — the promise
 * resolves and no sound comes out.
 *
 * Handing the file to Windows' own player (`System.Windows.Media.MediaPlayer`,
 * i.e. Media Foundation) removes every one of those moving parts. It is the
 * same strategy the school bell software this app replaced uses, and it is
 * what makes the automatic bell reliable.
 *
 * Everything here is best effort: any failure is reported to the caller so it
 * can fall back to the embedded player.
 */

/** Printed by the script as soon as the sound is actually audible. */
const START_SIGNAL = '__ds_bell_playing__'

/** PowerShell itself has to boot, so this is generous on purpose. */
const START_TIMEOUT_MS = 20_000

/** Hard stop for one file, however long it claims to be. */
const MAX_PLAYBACK_MS = 10 * 60_000

/**
 * The child process that is currently playing, kept so `stop()` can interrupt a
 * sound that is still ringing. It stays set until the child exits, not just
 * until playback has started.
 */
let current: ChildProcess | null = null

export function isNativePlaybackSupported(): boolean {
  return process.platform === 'win32'
}

/** PowerShell's string delimiter is the single quote; double it to escape. */
function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * `[Console]::Out` is used instead of `Write-Output` because the latter is
 * buffered when stdout is a pipe, which would hide the start signal until the
 * whole file had finished playing.
 */
function say(line: string): string {
  return `[Console]::Out.WriteLine(${psLiteral(line)});[Console]::Out.Flush()`
}

/**
 * WPF MediaPlayer. It is backed by Media Foundation, so it plays every format
 * this app accepts (mp3, wav, ogg and flac on Windows 10 and newer).
 */
function mediaPlayerScript(filePath: string, volume: number): string {
  const path = psLiteral(filePath)
  const level = Math.max(0, Math.min(1, volume)).toFixed(3)
  return [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName PresentationCore',
    'try{',
    '  $player=New-Object System.Windows.Media.MediaPlayer',
    `  $player.Volume=[double]${level}`,
    `  $player.Open([System.Uri]::new(${path}))`,
    '  $player.Play()',
    // The duration only exists once the file has been decoded. A file that
    // cannot be opened must not hang the bell engine forever.
    '  $deadline=(Get-Date).AddSeconds(8)',
    '  while(-not $player.NaturalDuration.HasTimeSpan){',
    "    if((Get-Date) -gt $deadline){throw 'the sound file could not be opened'}",
    '    Start-Sleep -Milliseconds 50',
    '  }',
    '  $seconds=$player.NaturalDuration.TimeSpan.TotalSeconds',
    `  ${say(START_SIGNAL)}`,
    '  Start-Sleep -Milliseconds ([int](($seconds+0.4)*1000))',
    '  $player.Stop()',
    '}finally{',
    '  if($player){$player.Close()}',
    '}'
  ].join(' ')
}

/**
 * Last resort for WAV files only, and only when the WPF player refused them.
 * `SoundPlayer` cannot set the volume, so it is a fallback, never the default.
 */
function soundPlayerScript(filePath: string): string {
  const path = psLiteral(filePath)
  return [
    "$ErrorActionPreference='Stop'",
    'try{',
    '  $player=New-Object System.Media.SoundPlayer',
    `  $player.SoundLocation=${path}`,
    '  $player.Load()',
    `  ${say(START_SIGNAL)}`,
    '  $player.PlaySync()',
    '}finally{',
    '  if($player){$player.Dispose()}',
    '}'
  ].join(' ')
}

/**
 * Play a file with the Windows audio stack.
 *
 * Resolves once the sound is audible; rejects with a readable reason when
 * Windows could not play it, so the caller can fall back to another backend.
 */
export async function playNativeSound(filePath: string, volume: number): Promise<void> {
  if (!isNativePlaybackSupported()) throw new AudioError('native playback needs Windows')

  stopNativeSound()

  const scripts = [mediaPlayerScript(filePath, volume)]
  if (soundExtension(filePath) === '.wav') scripts.push(soundPlayerScript(filePath))

  let lastError = 'the Windows audio player refused the file'
  for (const script of scripts) {
    try {
      await runScript(script)
      return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      console.error('[audio] the native Windows player failed:', lastError)
    }
  }
  throw new AudioError(lastError)
}

/** Stop whatever the native player is currently doing. */
export function stopNativeSound(): void {
  if (!current) return
  const child = current
  current = null
  child.kill()
}

function runScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess
    try {
      child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-NoLogo',
          '-STA',
          '-WindowStyle',
          'Hidden',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          script
        ],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      )
    } catch (error) {
      reject(new AudioError(error instanceof Error ? error.message : String(error)))
      return
    }

    current = child
    let started = false
    let settled = false
    let stdout = ''
    let stderr = ''

    const startTimer = setTimeout(() => {
      fail(new AudioError('the Windows audio player did not start in time'))
    }, START_TIMEOUT_MS)
    // Only guards a file that claims to play forever. It is deliberately not
    // cleared once playback starts, because the child stays alive until the
    // sound ends and a runaway file would otherwise ring indefinitely.
    const lengthTimer = setTimeout(() => {
      child.kill()
    }, MAX_PLAYBACK_MS)

    function release(): void {
      clearTimeout(startTimer)
      clearTimeout(lengthTimer)
      if (current === child) current = null
    }

    function succeed(): void {
      if (settled) return
      settled = true
      // `current` is intentionally left pointing at the child so `stop()` can
      // still interrupt the sound that is playing out.
      resolve()
    }

    function fail(error: Error): void {
      if (settled) return
      settled = true
      child.kill()
      release()
      reject(error)
    }

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
      if (!started && stdout.includes(START_SIGNAL)) {
        // The sound is audible now; the rest is the file playing out.
        started = true
        succeed()
      }
    })

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })

    child.on('error', (error: Error) => {
      fail(new AudioError(error.message))
    })

    child.on('close', (code: number | null) => {
      release()
      if (started) {
        succeed()
        return
      }
      const detail = (stderr || stdout).trim().split(/\r?\n/).filter(Boolean).pop()
      fail(new AudioError(detail || `the Windows audio player exited with code ${code ?? 'unknown'}`))
    })
  })
}
