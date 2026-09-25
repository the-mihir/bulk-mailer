import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import { CH } from '@shared/ipc'
import { handle, noInput } from './middleware/requireAuth'
import { registerAuthIpc } from './ipc/auth.ipc'
import { registerCampaignIpc } from './ipc/campaign.ipc'
import { registerExcelIpc } from './ipc/excel.ipc'
import { registerResendIpc } from './ipc/resend.ipc'
import * as auth from './services/auth.service'
import * as campaigns from './services/campaign.service'
import { markInterrupted } from './store/campaign.store'
import { DEV_URL, hardenContents, hardenSession, openExternalSafe } from './security'

let mainWindow: BrowserWindow | null = null
let quitting = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(bootstrap)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    title: 'Bulk Mailer',
    backgroundColor: '#0a0a0a',
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      devTools: !app.isPackaged
    }
  })
  hardenContents(win.webContents)
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => (mainWindow = null))

  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(!app.isPackaged
          ? ([{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }] as MenuItemConstructorOptions[])
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'About the Author (mihirdas.io)', click: () => openExternalSafe('https://mihirdas.io') },
        { type: 'separator' },
        { label: 'Resend Dashboard', click: () => openExternalSafe('https://resend.com/overview') },
        { label: 'Resend Usage Limits', click: () => openExternalSafe('https://resend.com/docs/api-reference/rate-limit') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function bootstrap(): void {
  app.setAppUserModelId('com.plexoralab.bulkmailer')
  app.setAboutPanelOptions({
    applicationName: 'Bulk Mailer',
    applicationVersion: app.getVersion(),
    copyright: 'Built by Mihir Das · mihirdas.io',
    authors: ['Mihir Das'],
    website: 'https://mihirdas.io'
  })
  hardenSession()
  markInterrupted()

  registerAuthIpc()
  registerResendIpc()
  registerExcelIpc()
  registerCampaignIpc()
  handle(CH.appInfo, noInput, () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    dataPath: app.getPath('userData')
  }))
  handle(
    CH.openExternal,
    z.url(),
    (url) => {
      openExternalSafe(url)
      return null
    },
    { public: true }
  )

  campaigns.initCampaigns(() => mainWindow)
  auth.setLockHandler(() => mainWindow?.webContents.send(CH.authLocked))

  buildMenu()
  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
}

app.on('web-contents-created', (_e, contents) => hardenContents(contents))

app.on('window-all-closed', () => {
  // Keep sending in the background on macOS when the window closes.
  if (process.platform !== 'darwin' || !campaigns.hasActive()) app.quit()
})

app.on('before-quit', (event) => {
  if (quitting || !campaigns.hasActive()) return
  event.preventDefault()
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    buttons: ['Keep sending', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    title: 'Campaign in progress',
    message: 'A campaign is still sending.',
    detail: 'If you quit now, sending stops after the current batch. You can resume it later from History.'
  })
  if (choice !== 1) return
  quitting = true
  void campaigns.shutdown().finally(() => app.quit())
})
