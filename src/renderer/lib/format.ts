export const nf = new Intl.NumberFormat()

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return s ? `${m} min ${s} sec` : `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

export function formatDate(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour12: false })
}
