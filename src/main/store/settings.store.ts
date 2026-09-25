import { safeStorage } from 'electron'
import { DEFAULT_SENDING } from '@shared/schemas'
import { JsonStore, dataPath } from './json-store'

export interface SettingsData {
  /** API key encrypted with the OS keychain (safeStorage), base64. Never plain text. */
  apiKeyEncrypted: string | null
  apiKeyLast4: string | null
  fromName: string
  fromEmail: string
  replyTo: string
  unsubscribeEmail: string
  batchSize: number
  requestsPerSecond: number
  maxRetries: number
  nameFallback: string
  verified: boolean
  verifiedAt: number | null
  lastTestRecipient: string
}

export const settingsStore = new JsonStore<SettingsData>(dataPath('settings.json'), () => ({
  apiKeyEncrypted: null,
  apiKeyLast4: null,
  fromName: '',
  fromEmail: '',
  replyTo: '',
  unsubscribeEmail: '',
  ...DEFAULT_SENDING,
  verified: false,
  verifiedAt: null,
  lastTestRecipient: ''
}))

export function encryptApiKey(key: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption is not available, so the API key cannot be stored safely.')
  }
  return safeStorage.encryptString(key).toString('base64')
}

/** Only main-process services call this. The value never crosses IPC. */
export function getApiKey(): string | null {
  const enc = settingsStore.read().apiKeyEncrypted
  if (!enc) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

export function maskKey(last4: string | null): string | null {
  return last4 ? `re_****${last4}` : null
}
