import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { CampaignSummary, Recipient, RecipientResult } from '@shared/types'
import { atomicWrite, dataPath } from './json-store'

/** Settings frozen at campaign start, so a resume sends exactly the same mail. */
export interface SendConfig {
  from: string
  replyTo: string
  unsubscribeEmail: string
  batchSize: number
  requestsPerSecond: number
  maxRetries: number
  nameFallback: string
}

/** Written once at start. */
export interface CampaignInput {
  subject: string
  html: string
  recipients: Recipient[]
  config: SendConfig
}

/** Rewritten after every batch, so a crash loses at most one batch of status. */
export interface CampaignState {
  summary: CampaignSummary
  results: RecipientResult[]
}

const dir = (): string => dataPath('campaigns')
const stateFile = (id: string): string => join(dir(), `${id}.json`)
const inputFile = (id: string): string => join(dir(), `${id}.input.json`)

export function saveInput(id: string, input: CampaignInput): void {
  atomicWrite(inputFile(id), JSON.stringify(input))
}

export function loadInput(id: string): CampaignInput | null {
  const f = inputFile(id)
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as CampaignInput) : null
}

export function saveState(state: CampaignState): void {
  atomicWrite(stateFile(state.summary.id), JSON.stringify(state))
}

export function loadState(id: string): CampaignState | null {
  const f = stateFile(id)
  if (!existsSync(f)) return null
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as CampaignState
  } catch {
    return null
  }
}

export function listSummaries(): CampaignSummary[] {
  if (!existsSync(dir())) return []
  return readdirSync(dir())
    .filter((f) => f.endsWith('.json') && !f.endsWith('.input.json'))
    .map((f) => loadState(f.slice(0, -5))?.summary)
    .filter((s): s is CampaignSummary => !!s)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function removeCampaign(id: string): void {
  rmSync(stateFile(id), { force: true })
  rmSync(inputFile(id), { force: true })
}

export function removeAll(): void {
  rmSync(dir(), { recursive: true, force: true })
}

/** On startup, anything left running/paused by a crash or quit becomes "interrupted". */
export function markInterrupted(): void {
  mkdirSync(dir(), { recursive: true })
  for (const s of listSummaries()) {
    if (s.status === 'running' || s.status === 'paused') {
      const state = loadState(s.id)
      if (!state) continue
      state.summary.status = 'interrupted'
      state.summary.statusReason = 'The app was closed while sending. Resume to continue where it stopped.'
      saveState(state)
    }
  }
}
