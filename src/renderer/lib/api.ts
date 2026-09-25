import type { IpcResult } from '@shared/types'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

/** Unwraps an IpcResult. Throws ApiError on failure; a lost session sends the user to /login. */
export async function call<T>(p: Promise<IpcResult<T>>): Promise<T> {
  const res = await p
  if (res.ok) return res.data
  if (res.code === 'UNAUTHORIZED') onUnauthorized()
  throw new ApiError(res.error, res.code)
}

export const api = window.api

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
