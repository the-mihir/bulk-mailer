import { randomUUID } from 'node:crypto'
import { htmlToText, renderHtml, renderSubject } from '@shared/template'
import type {
  CampaignDetail,
  CampaignProgress,
  CampaignSummary,
  LogEntry,
  Recipient,
  RecipientResult
} from '@shared/types'
import {
  loadInput,
  loadState,
  saveInput,
  saveState,
  type CampaignInput,
  type CampaignState,
  type SendConfig
} from '../store/campaign.store'
import { ResendError, sendBatch, type OutgoingEmail } from './resend.service'

const MAX_RATE_LIMIT_WAITS = 20
const MAX_LOG = 500

export function buildEmail(
  config: Pick<SendConfig, 'from' | 'replyTo' | 'unsubscribeEmail' | 'nameFallback'>,
  subject: string,
  html: string,
  r: Pick<Recipient, 'name' | 'email' | 'fields'>
): OutgoingEmail {
  const body = renderHtml(html, r, config.nameFallback)
  const email: OutgoingEmail = {
    from: config.from,
    to: [r.email],
    subject: renderSubject(subject, r, config.nameFallback),
    html: body,
    text: htmlToText(body)
  }
  if (config.replyTo) email.reply_to = [config.replyTo]
  if (config.unsubscribeEmail) {
    email.headers = { 'List-Unsubscribe': `<mailto:${config.unsubscribeEmail}?subject=unsubscribe>` }
  }
  return email
}

/** Sleeps, but wakes early when the signal aborts (cancel). */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || ms <= 0) return resolve()
    const t = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    function done(): void {
      clearTimeout(t)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

type Emit = (p: CampaignProgress) => void

/**
 * Sends one campaign in batches. Queue position lives in memory and on disk,
 * so pause/resume continues from the exact batch, even after an app restart.
 */
export class CampaignRunner {
  private readonly abort = new AbortController()
  private pauseRequested = false
  private resumeWaiter: (() => void) | null = null
  private lastRequestAt = 0
  private log: LogEntry[] = []
  /** Log entries not yet sent to the renderer. */
  private unsent: LogEntry[] = []
  private logSeq = 0
  private done: Promise<void> | null = null

  private constructor(
    private readonly state: CampaignState,
    private readonly input: CampaignInput,
    private readonly apiKey: () => string | null,
    private readonly emit: Emit
  ) {}

  static create(
    input: CampaignInput,
    meta: { sourceFile: string; retryOf: string | null },
    apiKey: () => string | null,
    emit: Emit
  ): CampaignRunner {
    const id = randomUUID()
    const total = input.recipients.length
    const summary: CampaignSummary = {
      id,
      subject: input.subject,
      sourceFile: meta.sourceFile,
      status: 'running',
      statusReason: null,
      total,
      sent: 0,
      failed: 0,
      createdAt: Date.now(),
      finishedAt: null,
      batchSize: input.config.batchSize,
      nextBatch: 0,
      totalBatches: Math.ceil(total / input.config.batchSize),
      retryOf: meta.retryOf
    }
    const results: RecipientResult[] = input.recipients.map((r) => ({
      row: r.row,
      email: r.email,
      name: r.name,
      status: 'pending',
      id: null,
      error: null,
      sentAt: null
    }))
    saveInput(id, input)
    const state = { summary, results }
    saveState(state)
    return new CampaignRunner(state, input, apiKey, emit)
  }

  /** Re-attach to a campaign saved on disk (interrupted by quit/crash). */
  static restore(id: string, apiKey: () => string | null, emit: Emit): CampaignRunner | null {
    const state = loadState(id)
    const input = loadInput(id)
    if (!state || !input) return null
    return new CampaignRunner(state, input, apiKey, emit)
  }

  get id(): string {
    return this.state.summary.id
  }

  get summary(): CampaignSummary {
    return { ...this.state.summary }
  }

  get isActive(): boolean {
    return this.state.summary.status === 'running' || this.state.summary.status === 'paused'
  }

  detail(): CampaignDetail {
    return { ...this.summary, results: this.state.results, log: this.log }
  }

  start(): Promise<void> {
    this.state.summary.status = 'running'
    this.state.summary.statusReason = null
    this.done = this.run().catch((err) => {
      this.addLog('error', `Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
      this.finish('stopped', 'Unexpected error. Check the log, then resume.')
    })
    return this.done
  }

  pause(): void {
    if (this.state.summary.status !== 'running') return
    this.pauseRequested = true
    this.addLog('info', 'Pause requested. Finishing the current batch…')
    this.publish([])
  }

  resume(): void {
    if (this.state.summary.status !== 'paused') {
      this.pauseRequested = false
      return
    }
    this.pauseRequested = false
    this.state.summary.status = 'running'
    this.state.summary.statusReason = null
    this.addLog('info', 'Resumed.')
    this.persist([])
    this.resumeWaiter?.()
  }

  cancel(): void {
    if (!this.isActive) return
    this.state.summary.status = 'cancelled'
    this.addLog('warn', 'Cancelled. Unsent recipients stay "pending".')
    this.abort.abort()
    this.resumeWaiter?.()
  }

  /** Waits for the loop to exit (used on app quit). */
  async stop(): Promise<void> {
    if (!this.isActive) return
    this.pauseRequested = true
    this.abort.abort()
    this.resumeWaiter?.()
    await this.done
  }

  private async run(): Promise<void> {
    const { config, recipients } = this.input
    const s = this.state.summary
    this.addLog('info', `Sending ${s.total - s.sent} email(s) in ${s.totalBatches - s.nextBatch} batch(es).`)
    this.publish([])

    while (s.nextBatch < s.totalBatches) {
      if (this.abort.signal.aborted) break
      if (this.pauseRequested) {
        await this.waitForResume('Paused.')
        continue
      }

      const index = s.nextBatch
      const start = index * config.batchSize
      const slice = recipients.slice(start, start + config.batchSize)
      const outcome = await this.sendWithRetry(index, slice)
      if (outcome === 'retry-later') continue // paused for quota, same batch again
      if (outcome === 'fatal') break
      // The batch finished (sent or failed): always record it, even if a quit is pending.

      s.nextBatch = index + 1
      this.persist(this.state.results.slice(start, start + slice.length))
    }

    if (s.status === 'cancelled') this.finish('cancelled', 'Cancelled by user.')
    else if (s.status === 'stopped') this.finish('stopped', s.statusReason)
    else if (this.abort.signal.aborted) this.finish('interrupted', 'The app was closed while sending.')
    else if (s.nextBatch >= s.totalBatches) {
      this.finish('completed', null)
      this.addLog('info', `Done. Sent ${s.sent}, failed ${s.failed}.`)
      this.publish([])
    }
  }

  private async sendWithRetry(
    index: number,
    slice: Recipient[]
  ): Promise<'ok' | 'failed' | 'retry-later' | 'fatal'> {
    const { config, subject, html } = this.input
    const emails = slice.map((r) => buildEmail(config, subject, html, r))
    const key = `${this.id}-${index}`
    const label = `Batch ${index + 1}/${this.state.summary.totalBatches}`
    let attempt = 0
    let rateWaits = 0

    for (;;) {
      if (this.abort.signal.aborted) return 'fatal'
      const apiKey = this.apiKey()
      if (!apiKey) {
        this.stopWith('The API key was removed. Add it in Settings, then resume.')
        return 'fatal'
      }

      await this.throttle(config.requestsPerSecond)
      try {
        const { ids, rate } = await sendBatch(apiKey, emails, key)
        const now = Date.now()
        slice.forEach((_, i) => this.mark(index * config.batchSize + i, 'sent', ids[i] ?? null, null, now))
        this.addLog('info', `${label}: sent ${slice.length}.`)
        if (rate.remaining === 0 && rate.resetMs) await sleep(rate.resetMs, this.abort.signal)
        return 'ok'
      } catch (err) {
        const e =
          err instanceof ResendError ? err : new ResendError(String(err), 0, 'unknown_error')

        if (e.isQuota) {
          const msg =
            e.name === 'daily_quota_exceeded'
              ? 'Daily sending quota reached. It resets at midnight UTC. Resume after that.'
              : 'Monthly sending quota reached. Upgrade the plan or resume next month.'
          this.addLog('error', `${label}: ${msg}`)
          await this.waitForResume(msg)
          return 'retry-later'
        }
        if (e.isRateLimit && rateWaits < MAX_RATE_LIMIT_WAITS) {
          rateWaits++
          const wait = e.retryAfterMs ?? 1000
          this.addLog('warn', `${label}: rate limited, waiting ${Math.ceil(wait / 1000)}s.`)
          await sleep(wait, this.abort.signal)
          continue
        }
        if (e.isFatal) {
          this.stopWith(`Resend rejected the request: ${e.message}. Fix Settings, then resume.`)
          return 'fatal'
        }
        if ((e.isTransient || e.isRateLimit) && attempt < config.maxRetries) {
          attempt++
          const wait = 2 ** attempt * 1000 + Math.floor(Math.random() * 500)
          this.addLog('warn', `${label}: ${e.message}. Retry ${attempt}/${config.maxRetries} in ${Math.ceil(wait / 1000)}s.`)
          await sleep(wait, this.abort.signal)
          continue
        }

        const now = Date.now()
        slice.forEach((_, i) => this.mark(index * config.batchSize + i, 'failed', null, e.message, now))
        this.addLog('error', `${label}: failed (${e.message}).`)
        return 'failed'
      }
    }
  }

  /** Spaces request starts so we never exceed requestsPerSecond. */
  private async throttle(rps: number): Promise<void> {
    const gap = Math.ceil(1000 / rps)
    const wait = this.lastRequestAt + gap - Date.now()
    if (wait > 0) await sleep(wait, this.abort.signal)
    this.lastRequestAt = Date.now()
  }

  private async waitForResume(reason: string): Promise<void> {
    const s = this.state.summary
    if (s.status !== 'cancelled') {
      s.status = 'paused'
      s.statusReason = reason
      this.pauseRequested = true
      this.persist([])
    }
    if (this.abort.signal.aborted) return
    await new Promise<void>((resolve) => (this.resumeWaiter = resolve))
    this.resumeWaiter = null
  }

  private stopWith(reason: string): void {
    this.state.summary.status = 'stopped'
    this.state.summary.statusReason = reason
    this.addLog('error', reason)
  }

  private mark(
    i: number,
    status: 'sent' | 'failed',
    id: string | null,
    error: string | null,
    at: number
  ): void {
    const r = this.state.results[i]
    if (r.status === 'sent') this.state.summary.sent--
    if (r.status === 'failed') this.state.summary.failed--
    r.status = status
    r.id = id
    r.error = error
    r.sentAt = status === 'sent' ? at : null
    if (status === 'sent') this.state.summary.sent++
    else this.state.summary.failed++
  }

  private finish(status: CampaignSummary['status'], reason: string | null): void {
    const s = this.state.summary
    s.status = status
    s.statusReason = reason
    s.finishedAt = Date.now()
    this.persist([])
  }

  private addLog(level: LogEntry['level'], message: string): void {
    const entry = { seq: ++this.logSeq, at: Date.now(), level, message }
    this.log.push(entry)
    this.unsent.push(entry)
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG)
  }

  private persist(changed: RecipientResult[]): void {
    saveState(this.state)
    this.publish(changed)
  }

  private publish(changed: RecipientResult[]): void {
    const log = this.unsent
    this.unsent = []
    this.emit({ campaign: this.summary, changed, log })
  }
}
