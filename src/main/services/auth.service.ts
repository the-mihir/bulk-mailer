import bcrypt from 'bcryptjs'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { LIMITS } from '@shared/schemas'
import type { AuthStatus } from '@shared/types'
import { userStore } from '../store/user.store'

const BCRYPT_ROUNDS = 12

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message)
  }
}

/** In-memory session. Closing the app ends it. */
let session: { token: string; username: string } | null = null
let idleTimer: NodeJS.Timeout | null = null
let onLock: (() => void) | null = null

export function setLockHandler(fn: () => void): void {
  onLock = fn
}

export function isAuthenticated(): boolean {
  return session !== null
}

export function status(): AuthStatus {
  const u = userStore.read()
  const lockedUntil = u.lockedUntil && u.lockedUntil > Date.now() ? u.lockedUntil : null
  return {
    state: !u.passwordHash ? 'no-account' : session ? 'logged-in' : 'logged-out',
    username: u.username,
    lockedUntil,
    autoLockMinutes: u.autoLockMinutes
  }
}

export async function setup(username: string, password: string): Promise<AuthStatus> {
  if (userStore.read().passwordHash) throw new AuthError('An account already exists.', 'ACCOUNT_EXISTS')
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  userStore.write({ username, passwordHash, failedAttempts: 0, lockedUntil: null })
  startSession(username)
  return status()
}

export async function login(username: string, password: string): Promise<AuthStatus> {
  const u = userStore.read()
  if (!u.passwordHash || !u.username) throw new AuthError('No account exists yet.', 'NO_ACCOUNT')
  if (u.lockedUntil && u.lockedUntil > Date.now()) {
    const mins = Math.ceil((u.lockedUntil - Date.now()) / 60_000)
    throw new AuthError(`Too many failed attempts. Try again in ${mins} minute(s).`, 'LOCKED')
  }

  // Always run bcrypt so a wrong username takes as long as a wrong password.
  const passOk = await bcrypt.compare(password, u.passwordHash)
  const userOk = safeEqual(username.toLowerCase(), u.username.toLowerCase())

  if (!passOk || !userOk) {
    const failedAttempts = u.failedAttempts + 1
    if (failedAttempts >= LIMITS.maxLoginAttempts) {
      userStore.write({ failedAttempts: 0, lockedUntil: Date.now() + LIMITS.lockoutMinutes * 60_000 })
      throw new AuthError(`Too many failed attempts. Locked for ${LIMITS.lockoutMinutes} minutes.`, 'LOCKED')
    }
    userStore.write({ failedAttempts, lockedUntil: null })
    const left = LIMITS.maxLoginAttempts - failedAttempts
    throw new AuthError(`Wrong username or password. ${left} attempt(s) left.`, 'BAD_CREDENTIALS')
  }

  userStore.write({ failedAttempts: 0, lockedUntil: null })
  startSession(u.username)
  return status()
}

export function logout(): AuthStatus {
  endSession()
  return status()
}

export async function changePassword(current: string, next: string): Promise<void> {
  const u = userStore.read()
  if (!u.passwordHash) throw new AuthError('No account exists yet.', 'NO_ACCOUNT')
  if (!(await bcrypt.compare(current, u.passwordHash))) {
    throw new AuthError('Current password is wrong.', 'BAD_CREDENTIALS')
  }
  userStore.write({ passwordHash: await bcrypt.hash(next, BCRYPT_ROUNDS) })
}

export function setAutoLockMinutes(minutes: number): void {
  userStore.write({ autoLockMinutes: minutes })
  touch()
}

/** Called on user activity in the renderer. Restarts the idle timer. */
export function touch(): void {
  if (!session) return
  if (idleTimer) clearTimeout(idleTimer)
  const ms = userStore.read().autoLockMinutes * 60_000
  idleTimer = setTimeout(() => {
    endSession()
    onLock?.()
  }, ms)
}

export function endSession(): void {
  session = null
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
}

function startSession(username: string): void {
  session = { token: randomBytes(32).toString('hex'), username }
  touch()
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}
