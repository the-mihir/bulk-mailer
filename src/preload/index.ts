import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CH, type BulkMailerApi } from '@shared/ipc'
import type { CampaignProgress } from '@shared/types'

const invoke = (channel: string, arg?: unknown) => ipcRenderer.invoke(channel, arg)

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// Only these functions reach the page. ipcRenderer itself is never exposed.
const api: BulkMailerApi = {
  auth: {
    status: () => invoke(CH.authStatus),
    setup: (i) => invoke(CH.authSetup, i),
    login: (i) => invoke(CH.authLogin, i),
    logout: () => invoke(CH.authLogout),
    changePassword: (i) => invoke(CH.authChangePassword, i),
    resetApp: () => invoke(CH.authResetApp),
    activity: () => ipcRenderer.send(CH.authActivity),
    onLocked: (cb) => subscribe(CH.authLocked, cb)
  },
  file: {
    open: () => invoke(CH.fileOpen),
    pathFor: (file) => webUtils.getPathForFile(file)
  },
  excel: {
    parse: (i) => invoke(CH.excelParse, i),
    saveSample: () => invoke(CH.excelSample)
  },
  resend: {
    getConfig: () => invoke(CH.resendGetConfig),
    saveConfig: (i) => invoke(CH.resendSaveConfig, i),
    testConnection: () => invoke(CH.resendTestConnection),
    removeKey: () => invoke(CH.resendRemoveKey)
  },
  settings: {
    get: () => invoke(CH.prefsGet),
    save: (i) => invoke(CH.prefsSave, i)
  },
  email: {
    sendTest: (i) => invoke(CH.emailSendTest, i)
  },
  campaign: {
    start: (i) => invoke(CH.campaignStart, i),
    pause: (id) => invoke(CH.campaignPause, id),
    resume: (id) => invoke(CH.campaignResume, id),
    cancel: (id) => invoke(CH.campaignCancel, id),
    get: (id) => invoke(CH.campaignGet, id),
    list: () => invoke(CH.campaignList),
    remove: (id) => invoke(CH.campaignDelete, id),
    retryFailed: (id) => invoke(CH.campaignRetryFailed, id),
    onProgress: (cb) => subscribe<CampaignProgress>(CH.campaignProgress, cb)
  },
  report: {
    export: (i) => invoke(CH.reportExport, i)
  },
  app: {
    info: () => invoke(CH.appInfo),
    openExternal: (url) => invoke(CH.openExternal, url)
  }
}

contextBridge.exposeInMainWorld('api', api)
