import { app, session, shell, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

export const DEV_URL = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined

export function rendererIndexUrl(): string {
  return pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
}

function isAppUrl(url: string): boolean {
  if (DEV_URL && url.startsWith(DEV_URL)) return true
  return url.split('#')[0] === rendererIndexUrl()
}

/** Only our own top-level renderer may call IPC (never iframes or foreign pages). */
export function isTrustedSender(event: IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  const frame = event.senderFrame
  if (!frame || frame.parent) return false
  return isAppUrl(frame.url)
}

export function openExternalSafe(url: string): void {
  try {
    const u = new URL(url)
    if (u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:') void shell.openExternal(u.toString())
  } catch {
    /* ignore malformed urls */
  }
}

/** Lock navigation: no new windows, no leaving the app page, no permissions. */
export function hardenContents(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      openExternalSafe(url)
    }
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
}

export function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
}
