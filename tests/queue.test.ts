import './electron-mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampaignProgress, Recipient } from '@shared/types'

const sendBatch = vi.fn()
vi.mock('../src/main/services/resend.service', async (orig) => {
  const real = await orig<typeof import('../src/main/services/resend.service')>()
  return { ...real, sendBatch: (...a: unknown[]) => sendBatch(...a) }
})

const { CampaignRunner } = await import('../src/main/services/queue.service')
const { ResendError } = await import('../src/main/services/resend.service')

function recipients(n: number): Recipient[] {
  return Array.from({ length: n }, (_, i) => ({ row: i + 2, email: `u${i}@x.io`, name: `U${i}`, fields: {} }))
}

const config = {
  from: 'Test <t@x.io>',
  replyTo: '',
  unsubscribeEmail: '',
  batchSize: 2,
  requestsPerSecond: 5,
  maxRetries: 2,
  nameFallback: 'there'
}

function run(n: number) {
  const events: CampaignProgress[] = []
  const r = CampaignRunner.create(
    { subject: 'Hi {{name}}', html: '<p>Hi {{name}}</p>', recipients: recipients(n), config },
    { sourceFile: 'x.csv', retryOf: null },
    () => 're_test',
    (p) => events.push(p)
  )
  return { r, events }
}

const ok = (emails?: unknown[]) => ({ ids: (emails ?? []).map((_, i) => `id-${i}`), rate: { remaining: 5, resetMs: 1000 } })

describe('CampaignRunner', () => {
  beforeEach(() => sendBatch.mockReset())

  it('sends all batches with idempotency keys and personalised content', async () => {
    sendBatch.mockImplementation(async (_k, emails) => ok(emails))
    const { r } = run(5)
    await r.start()
    expect(r.summary).toMatchObject({ status: 'completed', sent: 5, failed: 0, totalBatches: 3 })
    expect(sendBatch.mock.calls.length).toBe(3)
    const [, emails, key] = sendBatch.mock.calls[0]
    expect(key).toBe(`${r.id}-0`)
    expect(emails[0]).toMatchObject({ to: ['u0@x.io'], subject: 'Hi U0', html: '<p>Hi U0</p>', text: 'Hi U0' })
  })

  it('waits on rate limit and retries transient errors with the same key', async () => {
    sendBatch
      .mockRejectedValueOnce(new ResendError('slow down', 429, 'rate_limit_exceeded', 10))
      .mockRejectedValueOnce(new ResendError('boom', 500, 'internal_server_error'))
      .mockImplementation(async (_k, emails) => ok(emails))
    const { r } = run(2)
    await r.start()
    expect(r.summary).toMatchObject({ status: 'completed', sent: 2 })
    expect(new Set(sendBatch.mock.calls.map((c) => c[2]))).toEqual(new Set([`${r.id}-0`]))
  }, 10_000)

  it('marks a batch failed after max retries and continues', async () => {
    sendBatch
      .mockRejectedValueOnce(new ResendError('bad', 422, 'validation_error'))
      .mockImplementation(async (_k, emails) => ok(emails))
    const { r } = run(4)
    await r.start()
    expect(r.summary).toMatchObject({ status: 'completed', sent: 2, failed: 2 })
    expect(r.detail().results[0]).toMatchObject({ status: 'failed', error: 'bad' })
  })

  it('pauses on quota and continues after resume', async () => {
    sendBatch
      .mockRejectedValueOnce(new ResendError('quota', 429, 'daily_quota_exceeded'))
      .mockImplementation(async (_k, emails) => ok(emails))
    const { r } = run(2)
    const done = r.start()
    await vi.waitFor(() => expect(r.summary.status).toBe('paused'))
    expect(r.summary.statusReason).toMatch(/Daily sending quota/)
    r.resume()
    await done
    expect(r.summary).toMatchObject({ status: 'completed', sent: 2 })
  })

  it('stops on an invalid key', async () => {
    sendBatch.mockImplementation(async (k) => {
      if (k) throw new ResendError('API key is invalid', 401, 'validation_error')
      return ok()
    })
    const { r } = run(4)
    await r.start()
    expect(r.summary.status).toBe('stopped')
    expect(r.summary.sent).toBe(0)
    expect(sendBatch.mock.calls.length).toBe(1)
  })

  it('cancels and leaves the rest pending', async () => {
    let calls = 0
    const { r } = run(6)
    sendBatch.mockImplementation(async (_k, emails) => {
      if (++calls === 1) r.cancel()
      return ok(emails)
    })
    await r.start()
    expect(r.summary).toMatchObject({ status: 'cancelled', sent: 2 })
    expect(r.detail().results.filter((x) => x.status === 'pending')).toHaveLength(4)
  })

  it('restores from disk and resumes at the saved batch', async () => {
    let calls = 0
    const { r } = run(6)
    sendBatch.mockImplementation(async (_k, emails) => {
      if (++calls === 2) void r.stop()
      return ok(emails)
    })
    await r.start()
    expect(r.summary.status).toBe('interrupted')
    expect(r.summary.nextBatch).toBe(2)

    sendBatch.mockReset().mockImplementation(async (_k, emails) => ok(emails))
    const restored = CampaignRunner.restore(r.id, () => 're_test', () => {})!
    await restored.start()
    expect(restored.summary).toMatchObject({ status: 'completed', sent: 6 })
    expect(sendBatch.mock.calls.map((c) => c[2])).toEqual([`${r.id}-2`])
  })
})
