import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z, type ZodType } from 'zod'
import type { IpcResult } from '@shared/types'
import { AuthError, isAuthenticated } from '../services/auth.service'
import { isTrustedSender } from '../security'

export class UserError extends Error {
  constructor(
    message: string,
    readonly code = 'USER_ERROR'
  ) {
    super(message)
  }
}

interface HandlerOptions {
  /** auth:* channels are the only ones that may run without a session. */
  public?: boolean
}

/**
 * Registers an IPC handler that
 *  1. rejects calls from any frame other than our own renderer,
 *  2. requires a logged-in session (unless public),
 *  3. validates input with Zod,
 *  4. wraps the result as IpcResult so errors never throw across the bridge.
 */
export function handle<S extends ZodType, R>(
  channel: string,
  schema: S,
  fn: (input: z.output<S>, event: IpcMainInvokeEvent) => Promise<R> | R,
  opts: HandlerOptions = {}
): void {
  ipcMain.handle(channel, async (event, raw): Promise<IpcResult<R>> => {
    if (!isTrustedSender(event)) return { ok: false, error: 'Forbidden', code: 'FORBIDDEN' }
    if (!opts.public && !isAuthenticated()) {
      return { ok: false, error: 'Please log in.', code: 'UNAUTHORIZED' }
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      const where = first?.path.length ? `${first.path.join('.')}: ` : ''
      return { ok: false, error: `Invalid input. ${where}${first?.message ?? ''}`, code: 'VALIDATION' }
    }
    try {
      return { ok: true, data: await fn(parsed.data, event) }
    } catch (err) {
      if (err instanceof AuthError || err instanceof UserError) {
        return { ok: false, error: err.message, code: err.code }
      }
      console.error(`[ipc] ${channel} failed`, err)
      return { ok: false, error: err instanceof Error ? err.message : 'Unexpected error', code: 'INTERNAL' }
    }
  })
}

export const noInput = z.undefined().or(z.null()).optional()
