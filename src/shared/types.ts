import type { Preferences, ResendConfigValues } from './schemas'

export interface Recipient {
  /** 1-based spreadsheet row number (header is row 1). */
  row: number
  email: string
  name: string
  /** All columns, keyed by normalized header (lowercase, spaces to underscores). */
  fields: Record<string, string>
}

export interface InvalidRow {
  row: number
  email: string
  name: string
  reason: string
}

export interface DuplicateRow {
  row: number
  email: string
  name: string
  firstRow: number
}

export type ParseResult =
  | {
      kind: 'ok'
      fileName: string
      headers: string[]
      /** Normalized variable names available as {{placeholders}}. */
      variables: string[]
      valid: Recipient[]
      invalid: InvalidRow[]
      duplicates: DuplicateRow[]
      truncated: boolean
    }
  | {
      kind: 'needsMapping'
      fileName: string
      headers: string[]
      guess: { name: string | null; email: string | null }
    }

export type AuthState = 'no-account' | 'logged-out' | 'logged-in'

export interface AuthStatus {
  state: AuthState
  username: string | null
  lockedUntil: number | null
  autoLockMinutes: number
}

export interface ResendSettingsView extends Omit<ResendConfigValues, 'apiKey'> {
  /** Masked key such as re_****abcd, or null when none is stored. */
  apiKeyMasked: string | null
  verified: boolean
  verifiedAt: number | null
  lastTestRecipient: string
}

export interface ConnectionResult {
  status: 'ok' | 'restricted' | 'error'
  message: string
  domains?: { name: string; status: string }[]
}

export type RecipientStatus = 'pending' | 'sent' | 'failed'

export interface RecipientResult {
  row: number
  email: string
  name: string
  status: RecipientStatus
  id: string | null
  error: string | null
  sentAt: number | null
}

export type CampaignStatus =
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'stopped'
  | 'interrupted'

export interface CampaignSummary {
  id: string
  subject: string
  sourceFile: string
  status: CampaignStatus
  /** Why the campaign paused or stopped (quota, invalid key...). */
  statusReason: string | null
  total: number
  sent: number
  failed: number
  createdAt: number
  finishedAt: number | null
  batchSize: number
  nextBatch: number
  totalBatches: number
  retryOf: string | null
}

export interface CampaignDetail extends CampaignSummary {
  results: RecipientResult[]
  /** Live log. Only present while the campaign is loaded in this session. */
  log: LogEntry[]
}

export interface CampaignProgress {
  campaign: CampaignSummary
  /** Rows whose status changed since the last event. */
  changed: RecipientResult[]
  log: LogEntry[]
}

export interface LogEntry {
  /** Increases by one per entry within a campaign run; used to drop duplicates. */
  seq: number
  at: number
  level: 'info' | 'warn' | 'error'
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string }

export type { Preferences }
