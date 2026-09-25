import type { BulkMailerApi } from '../shared/ipc'

declare global {
  interface Window {
    api: BulkMailerApi
  }
}

export {}
