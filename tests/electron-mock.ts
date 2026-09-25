import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

export const userData = mkdtempSync(join(tmpdir(), 'bulk-mailer-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => userData, getVersion: () => '0.0.0-test', isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => b.toString().slice(4)
  },
  session: {},
  shell: {}
}))
