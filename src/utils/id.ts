/**
 * Short, readable, collision-safe ids.
 * `createId('b')` → `b_l8x2k4_91`
 */

let counter = 0

interface CryptoLike {
  randomUUID?: () => string
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T
}

function randomPart(): string {
  const cryptoObj = (globalThis as { crypto?: CryptoLike }).crypto
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID().replace(/-/g, '').slice(0, 8)
  }
  if (cryptoObj?.getRandomValues) {
    const buffer = new Uint8Array(4)
    cryptoObj.getRandomValues(buffer)
    return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return Math.random().toString(36).slice(2, 10)
}

export function createId(prefix?: string): string {
  counter = (counter + 1) % 100000
  const stamp = Date.now().toString(36).slice(-5)
  const seq = counter.toString(36).padStart(3, '0')
  const id = `${stamp}${seq}${randomPart().slice(0, 4)}`
  return prefix ? `${prefix}_${id}` : id
}

/** Build a unique file name for an imported audio file. */
export function uniqueFileName(baseName: string, extension: string): string {
  const stamp = Date.now().toString(36)
  return `${baseName.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40)}_${stamp}${extension}`
}
