import { ipcMain } from 'electron'
import { changePasswordSchema, loginSchema, setupSchema } from '@shared/schemas'
import { CH } from '@shared/ipc'
import { handle, noInput } from '../middleware/requireAuth'
import * as auth from '../services/auth.service'
import * as campaigns from '../services/campaign.service'
import { settingsStore } from '../store/settings.store'
import { userStore } from '../store/user.store'
import { isTrustedSender } from '../security'

export function registerAuthIpc(): void {
  handle(CH.authStatus, noInput, () => auth.status(), { public: true })
  handle(CH.authSetup, setupSchema, (i) => auth.setup(i.username, i.password), { public: true })
  handle(CH.authLogin, loginSchema, (i) => auth.login(i.username, i.password), { public: true })
  handle(CH.authLogout, noInput, () => auth.logout(), { public: true })

  handle(CH.authChangePassword, changePasswordSchema, async (i) => {
    await auth.changePassword(i.currentPassword, i.newPassword)
    return null
  })

  // "Forgot password" path: anyone at the login screen may reset, but a reset
  // wipes the API key, settings and history, so nothing secret is exposed.
  handle(
    CH.authResetApp,
    noInput,
    async () => {
      await campaigns.wipe()
      auth.endSession()
      settingsStore.clear()
      userStore.clear()
      return auth.status()
    },
    { public: true }
  )

  ipcMain.on(CH.authActivity, (event) => {
    if (isTrustedSender(event)) auth.touch()
  })
}
