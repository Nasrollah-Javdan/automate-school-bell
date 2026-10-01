import type { AudioCommand, AudioEvent } from '../shared/audioTypes.js'

/**
 * Hidden audio host.
 *
 * Runs in its own window so that bell sounds keep playing while the main
 * interface is hidden, slow or being rebuilt. It receives commands from the
 * main process only and reports back what happened.
 */
declare global {
  interface Window {
    bellAudioHost: {
      emit: (event: AudioEvent) => void
      onCommand: (listener: (command: AudioCommand) => void) => () => void
    }
  }
}

const emit = (event: AudioEvent): void => window.bellAudioHost.emit(event)

const element = new Audio()
element.preload = 'auto'
element.autoplay = true

let currentRequestId: string | null = null

async function play(requestId: string, src: string, volume: number): Promise<void> {
  element.pause()
  currentRequestId = requestId
  element.src = src
  element.volume = Math.max(0, Math.min(1, volume))

  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      element.removeEventListener('canplaythrough', onReady)
      element.removeEventListener('error', onError)
    }
    const onReady = (): void => {
      cleanup()
      resolve()
    }
    const onError = (): void => {
      cleanup()
      reject(new Error(element.error?.message || 'the audio file could not be decoded'))
    }
    element.addEventListener('canplaythrough', onReady, { once: true })
    element.addEventListener('error', onError, { once: true })
    element.load()
  })

  await element.play()
  emit({ type: 'started', requestId })
}

function stop(): void {
  element.pause()
  currentRequestId = null
}

function probe(requestId: string, src: string): void {
  const probeElement = new Audio()
  probeElement.preload = 'metadata'
  probeElement.addEventListener(
    'loadedmetadata',
    () => {
      const durationSec = Number.isFinite(probeElement.duration) ? probeElement.duration : null
      probeElement.src = ''
      emit({ type: 'probed', requestId, durationSec })
    },
    { once: true }
  )
  probeElement.addEventListener(
    'error',
    () => {
      probeElement.src = ''
      emit({ type: 'probed', requestId, durationSec: null })
    },
    { once: true }
  )
  probeElement.src = src
}

element.addEventListener('ended', () => {
  if (currentRequestId) emit({ type: 'ended', requestId: currentRequestId })
  currentRequestId = null
})

element.addEventListener('error', () => {
  if (!currentRequestId) return
  const requestId = currentRequestId
  currentRequestId = null
  emit({ type: 'error', requestId, message: element.error?.message || 'the audio file could not be played' })
})

window.bellAudioHost.onCommand((command: AudioCommand) => {
  if (command.type === 'play') {
    void play(command.requestId, command.src, command.volume).catch((error: unknown) => {
      emit({
        type: 'error',
        requestId: command.requestId,
        message: error instanceof Error ? error.message : String(error)
      })
    })
    return
  }

  if (command.type === 'stop') {
    stop()
    return
  }

  if (command.type === 'probe') {
    probe(command.requestId, command.src)
  }
})

// Report readiness so the main process can start sending commands.
let announced = false
const announce = (): void => {
  if (announced) return
  announced = true
  emit({ type: 'ready' })
}

window.addEventListener('DOMContentLoaded', announce)
if (document.readyState !== 'loading') announce()

// Stop playback if the host is torn down.
window.addEventListener('beforeunload', stop)

export {}