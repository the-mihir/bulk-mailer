import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function dataPath(...parts: string[]): string {
  return join(app.getPath('userData'), ...parts)
}

/**
 * Small JSON file store. Writes go to a temp file first and are renamed into
 * place, so a crash mid-write never leaves a half-written file behind.
 */
export class JsonStore<T extends object> {
  private cache: T | null = null

  constructor(
    private readonly file: string,
    private readonly defaults: () => T
  ) {}

  read(): T {
    if (this.cache) return this.cache
    let value = this.defaults()
    if (existsSync(this.file)) {
      try {
        value = { ...value, ...(JSON.parse(readFileSync(this.file, 'utf8')) as Partial<T>) }
      } catch (err) {
        // Keep the unreadable file for inspection and start fresh.
        console.error(`[store] ${this.file} is corrupt, resetting`, err)
        renameSync(this.file, `${this.file}.corrupt-${Date.now()}`)
      }
    }
    this.cache = value
    return value
  }

  write(patch: Partial<T>): T {
    const next = { ...this.read(), ...patch }
    atomicWrite(this.file, JSON.stringify(next, null, 2))
    this.cache = next
    return next
  }

  clear(): void {
    this.cache = null
    rmSync(this.file, { force: true })
  }
}

export function atomicWrite(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, file)
}
