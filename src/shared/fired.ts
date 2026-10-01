/**
 * Duplicate-prevention helpers.
 *
 * Every bell occurrence gets a unique id such as `2026-09-27_09:30_b1`.
 * The engine stores the ids it has handled, which is what guarantees that a
 * bell never plays twice for the same day — no matter how often the schedule
 * is recalculated, refreshed or restarted.
 */

export const FIRED_RETENTION_DAYS = 7
export const MAX_FIRED_IDS = 600

export function isFiredId(id: string): boolean {
  return /^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}_[A-Za-z0-9_-]+$/.test(id)
}

export function dayKeyOf(id: string): string {
  return id.split('_')[0] ?? ''
}

/** Drop ids that are malformed, too old or beyond the maximum kept size. */
export function pruneFiredIds(ids: string[], today = new Date()): void {
  const keep: string[] = []

  for (const id of ids) {
    if (!isFiredId(id)) continue
    const day = new Date(`${dayKeyOf(id)}T00:00:00`)
    if (Number.isNaN(day.getTime())) continue
    const ageDays = (today.getTime() - day.getTime()) / 86_400_000
    if (ageDays <= FIRED_RETENTION_DAYS) keep.push(id)
  }

  ids.length = 0
  ids.push(...keep.slice(-MAX_FIRED_IDS))
}