import { CH } from '@shared/ipc'
import { preferencesSchema, resendConfigSchema, sendTestSchema } from '@shared/schemas'
import type { ConnectionResult, ResendSettingsView } from '@shared/types'
import { UserError, handle, noInput } from '../middleware/requireAuth'
import * as auth from '../services/auth.service'
import { ResendError, formatFrom, listDomains, sendOne } from '../services/resend.service'
import { buildEmail } from '../services/queue.service'
import { encryptApiKey, getApiKey, maskKey, settingsStore } from '../store/settings.store'
import { userStore } from '../store/user.store'

function view(): ResendSettingsView {
  const s = settingsStore.read()
  return {
    apiKeyMasked: maskKey(s.apiKeyLast4),
    fromName: s.fromName,
    fromEmail: s.fromEmail,
    replyTo: s.replyTo,
    unsubscribeEmail: s.unsubscribeEmail,
    batchSize: s.batchSize,
    requestsPerSecond: s.requestsPerSecond,
    maxRetries: s.maxRetries,
    nameFallback: s.nameFallback,
    verified: s.verified,
    verifiedAt: s.verifiedAt,
    lastTestRecipient: s.lastTestRecipient
  }
}

function requireKey(): string {
  const key = getApiKey()
  if (!key) throw new UserError('Add your Resend API key first.', 'NOT_CONFIGURED')
  return key
}

export function registerResendIpc(): void {
  handle(CH.resendGetConfig, noInput, view)

  handle(CH.resendSaveConfig, resendConfigSchema, (i) => {
    const prev = settingsStore.read()
    const { apiKey, ...rest } = i
    const keyChanged = apiKey !== ''
    if (!keyChanged && !prev.apiKeyEncrypted) throw new UserError('API key is required.')
    // A new key or sender address must be verified again before sending.
    const needsReverify = keyChanged || rest.fromEmail !== prev.fromEmail
    settingsStore.write({
      ...rest,
      ...(keyChanged ? { apiKeyEncrypted: encryptApiKey(apiKey), apiKeyLast4: apiKey.slice(-4) } : {}),
      ...(needsReverify ? { verified: false, verifiedAt: null } : {})
    })
    return view()
  })

  handle(CH.resendRemoveKey, noInput, () => {
    settingsStore.write({ apiKeyEncrypted: null, apiKeyLast4: null, verified: false, verifiedAt: null })
    return view()
  })

  handle(CH.resendTestConnection, noInput, async (): Promise<ConnectionResult> => {
    const key = requireKey()
    const s = settingsStore.read()
    const domain = s.fromEmail.split('@')[1] ?? ''
    try {
      const domains = await listDomains(key)
      const match = domains.find((d) => d.name.toLowerCase() === domain)
      if (!match) {
        settingsStore.write({ verified: false, verifiedAt: null })
        return { status: 'error', message: `Key works, but ${domain || 'the From domain'} is not added in Resend.`, domains }
      }
      if (match.status !== 'verified') {
        settingsStore.write({ verified: false, verifiedAt: null })
        return { status: 'error', message: `Domain ${domain} is "${match.status}", not verified. Check SPF/DKIM in DNS.`, domains }
      }
      settingsStore.write({ verified: true, verifiedAt: Date.now() })
      return { status: 'ok', message: `Connected · ${domain} verified`, domains }
    } catch (err) {
      if (err instanceof ResendError && err.name === 'restricted_api_key') {
        // Sending-only keys cannot list domains. A test email proves the setup instead.
        return {
          status: 'restricted',
          message: 'Key is valid (sending access only). Send a test email to confirm the domain works.'
        }
      }
      settingsStore.write({ verified: false, verifiedAt: null })
      if (err instanceof ResendError && err.status === 401) return { status: 'error', message: 'Invalid API key.' }
      return { status: 'error', message: err instanceof Error ? err.message : 'Connection failed.' }
    }
  })

  handle(CH.emailSendTest, sendTestSchema, async (i) => {
    const key = requireKey()
    const s = settingsStore.read()
    if (!s.fromEmail || !s.fromName) throw new UserError('Set the From name and email in Settings.')
    const sample = i.sample ?? { name: '', email: i.to, fields: {} }
    const email = buildEmail(
      { from: formatFrom(s.fromName, s.fromEmail), replyTo: s.replyTo, unsubscribeEmail: s.unsubscribeEmail, nameFallback: s.nameFallback },
      `[TEST] ${i.subject}`,
      i.html,
      sample
    )
    email.to = [i.to]
    try {
      const id = await sendOne(key, email)
      settingsStore.write({ verified: true, verifiedAt: Date.now(), lastTestRecipient: i.to })
      return { id }
    } catch (err) {
      if (err instanceof ResendError) throw new UserError(`Resend: ${err.message}`, err.name)
      throw err
    }
  })

  handle(CH.prefsGet, noInput, () => ({ autoLockMinutes: userStore.read().autoLockMinutes }))
  handle(CH.prefsSave, preferencesSchema, (i) => {
    auth.setAutoLockMinutes(i.autoLockMinutes)
    return { autoLockMinutes: i.autoLockMinutes }
  })
}

