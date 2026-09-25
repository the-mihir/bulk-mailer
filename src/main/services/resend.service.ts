import { app } from 'electron'

const API = 'https://api.resend.com'
const TIMEOUT_MS = 30_000

export interface OutgoingEmail {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  reply_to?: string[]
  headers?: Record<string, string>
}

export class ResendError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 for network failures and timeouts. */
    readonly status: number,
    /** Resend error name, e.g. rate_limit_exceeded, daily_quota_exceeded. */
    readonly name: string,
    readonly retryAfterMs: number | null = null
  ) {
    super(message)
  }

  get isQuota(): boolean {
    return this.name === 'daily_quota_exceeded' || this.name === 'monthly_quota_exceeded'
  }

  get isRateLimit(): boolean {
    return this.status === 429 && !this.isQuota
  }

  /** Safe to retry: network, timeouts, 5xx and concurrent-idempotency conflicts. */
  get isTransient(): boolean {
    return this.status === 0 || this.status >= 500 || this.name === 'concurrent_idempotent_requests'
  }

  /** The key or sender is wrong. Every later request would fail the same way. */
  get isFatal(): boolean {
    return this.status === 401 || this.status === 403
  }
}

export interface RateInfo {
  remaining: number | null
  resetMs: number | null
}

async function request<T>(
  apiKey: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<{ data: T; rate: RateInfo }> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': `bulk-mailer/${app.getVersion()}`,
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (err) {
    const msg = err instanceof Error && err.name === 'TimeoutError' ? 'Request timed out' : 'Network error'
    throw new ResendError(`${msg}: ${err instanceof Error ? err.message : String(err)}`, 0, 'network_error')
  }

  const rate: RateInfo = {
    remaining: numHeader(res, 'ratelimit-remaining'),
    resetMs: secondsHeader(res, 'ratelimit-reset')
  }
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON body, handled below */
  }

  if (!res.ok) {
    const obj = (json ?? {}) as { message?: string; name?: string }
    throw new ResendError(
      obj.message || `HTTP ${res.status}`,
      res.status,
      obj.name || `http_${res.status}`,
      secondsHeader(res, 'retry-after')
    )
  }
  return { data: json as T, rate }
}

function numHeader(res: Response, name: string): number | null {
  const v = res.headers.get(name)
  const n = v === null ? NaN : Number(v)
  return Number.isFinite(n) ? n : null
}

function secondsHeader(res: Response, name: string): number | null {
  const n = numHeader(res, name)
  return n === null ? null : Math.max(0, n * 1000)
}

export async function sendOne(apiKey: string, email: OutgoingEmail): Promise<string> {
  const { data } = await request<{ id: string }>(apiKey, 'POST', '/emails', email)
  return data.id
}

export async function sendBatch(
  apiKey: string,
  emails: OutgoingEmail[],
  idempotencyKey: string
): Promise<{ ids: string[]; rate: RateInfo }> {
  const { data, rate } = await request<{ data: { id: string }[] }>(apiKey, 'POST', '/emails/batch', emails, {
    'Idempotency-Key': idempotencyKey
  })
  return { ids: (data?.data ?? []).map((d) => d.id), rate }
}

export async function listDomains(apiKey: string): Promise<{ name: string; status: string }[]> {
  const { data } = await request<{ data: { name: string; status: string }[] }>(apiKey, 'GET', '/domains')
  return (data?.data ?? []).map((d) => ({ name: d.name, status: d.status }))
}

export function formatFrom(name: string, email: string): string {
  return `${name} <${email}>`
}
