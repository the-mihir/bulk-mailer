import { JsonStore, dataPath } from './json-store'

export interface UserData {
  username: string | null
  passwordHash: string | null
  failedAttempts: number
  /** Epoch ms. Persisted so restarting the app does not reset the lockout. */
  lockedUntil: number | null
  autoLockMinutes: number
}

export const userStore = new JsonStore<UserData>(dataPath('user.json'), () => ({
  username: null,
  passwordHash: null,
  failedAttempts: 0,
  lockedUntil: null,
  autoLockMinutes: 15
}))
