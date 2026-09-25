import type { BrowserWindow } from 'electron'
import type { CampaignDetail, CampaignProgress, CampaignSummary, Recipient } from '@shared/types'
import { CH } from '@shared/ipc'
import { UserError } from '../middleware/requireAuth'
import { listSummaries, loadInput, loadState, removeAll, removeCampaign } from '../store/campaign.store'
import { getApiKey, settingsStore } from '../store/settings.store'
import { formatFrom } from './resend.service'
import { CampaignRunner } from './queue.service'

let runner: CampaignRunner | null = null
let getWindow: () => BrowserWindow | null = () => null

export function initCampaigns(win: () => BrowserWindow | null): void {
  getWindow = win
}

function emit(p: CampaignProgress): void {
  const w = getWindow()
  if (w && !w.isDestroyed()) w.webContents.send(CH.campaignProgress, p)
}

function assertReady(): void {
  const s = settingsStore.read()
  if (!getApiKey()) throw new UserError('Add your Resend API key in Settings first.', 'NOT_CONFIGURED')
  if (!s.fromEmail || !s.fromName) throw new UserError('Set the From name and email in Settings.', 'NOT_CONFIGURED')
  if (!s.verified) {
    throw new UserError('Run "Test connection" (or send a test email) in Settings before sending.', 'NOT_VERIFIED')
  }
  if (runner?.isActive) throw new UserError('Another campaign is still running or paused. Finish or cancel it first.', 'BUSY')
}

function currentConfig() {
  const s = settingsStore.read()
  return {
    from: formatFrom(s.fromName, s.fromEmail),
    replyTo: s.replyTo,
    unsubscribeEmail: s.unsubscribeEmail,
    batchSize: s.batchSize,
    requestsPerSecond: s.requestsPerSecond,
    maxRetries: s.maxRetries,
    nameFallback: s.nameFallback
  }
}

function launch(r: CampaignRunner): CampaignSummary {
  runner = r
  void r.start()
  return r.summary
}

export function start(input: {
  subject: string
  html: string
  recipients: Recipient[]
  sourceFile: string
}): CampaignSummary {
  assertReady()
  return launch(
    CampaignRunner.create(
      { subject: input.subject, html: input.html, recipients: input.recipients, config: currentConfig() },
      { sourceFile: input.sourceFile, retryOf: null },
      getApiKey,
      emit
    )
  )
}

function active(id: string): CampaignRunner {
  if (!runner || runner.id !== id) throw new UserError('This campaign is not running.', 'NOT_ACTIVE')
  return runner
}

export function pause(id: string): CampaignSummary {
  const r = active(id)
  r.pause()
  return r.summary
}

export function resume(id: string): CampaignSummary {
  if (runner && runner.id === id && runner.isActive) {
    runner.resume()
    return runner.summary
  }
  // Interrupted (app closed) or stopped (bad key): continue from the saved batch.
  const state = loadState(id)
  if (!state) throw new UserError('Campaign not found.')
  if (!['interrupted', 'stopped'].includes(state.summary.status)) {
    throw new UserError(`A ${state.summary.status} campaign cannot be resumed.`)
  }
  assertReady()
  const r = CampaignRunner.restore(id, getApiKey, emit)
  if (!r) throw new UserError('Saved campaign data is missing, so it cannot be resumed.')
  return launch(r)
}

export function cancel(id: string): CampaignSummary {
  const r = active(id)
  r.cancel()
  return r.summary
}

export function get(id: string): CampaignDetail {
  if (runner && runner.id === id) return runner.detail()
  const state = loadState(id)
  if (!state) throw new UserError('Campaign not found.')
  return { ...state.summary, results: state.results, log: [] }
}

export function list(): CampaignSummary[] {
  const saved = listSummaries()
  if (!runner) return saved
  return saved.map((s) => (s.id === runner!.id ? runner!.summary : s))
}

export function remove(id: string): void {
  if (runner?.id === id && runner.isActive) throw new UserError('Cancel the campaign before deleting it.')
  if (runner?.id === id) runner = null
  removeCampaign(id)
}

/** New campaign with every recipient that was not sent (failed or still pending). */
export function retryFailed(id: string): CampaignSummary {
  assertReady()
  const state = loadState(id)
  const input = loadInput(id)
  if (!state || !input) throw new UserError('Saved campaign data is missing.')
  if (['running', 'paused'].includes(state.summary.status)) throw new UserError('Campaign is still active.')
  const unsent = new Set(state.results.filter((r) => r.status !== 'sent').map((r) => r.email))
  const recipients = input.recipients.filter((r) => unsent.has(r.email))
  if (recipients.length === 0) throw new UserError('Nothing to retry. Every email was sent.')
  return launch(
    CampaignRunner.create(
      { subject: input.subject, html: input.html, recipients, config: currentConfig() },
      { sourceFile: state.summary.sourceFile, retryOf: id },
      getApiKey,
      emit
    )
  )
}

export function hasActive(): boolean {
  return !!runner?.isActive
}

export async function shutdown(): Promise<void> {
  await runner?.stop()
}

export async function wipe(): Promise<void> {
  await shutdown()
  runner = null
  removeAll()
}
