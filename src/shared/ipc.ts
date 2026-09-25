import type {
  AuthStatus,
  CampaignDetail,
  CampaignProgress,
  CampaignSummary,
  ConnectionResult,
  IpcResult,
  ParseResult,
  Preferences,
  ResendSettingsView
} from './types'
import type { ResendConfigInput } from './schemas'
import type { Recipient } from './types'

/** Every channel name, in one place. Renderer never uses raw strings. */
export const CH = {
  authStatus: 'auth:status',
  authSetup: 'auth:setup',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authChangePassword: 'auth:changePassword',
  authResetApp: 'auth:resetApp',
  authActivity: 'auth:activity',
  authLocked: 'auth:locked',
  fileOpen: 'file:open',
  excelParse: 'excel:parse',
  excelSample: 'excel:saveSample',
  resendGetConfig: 'resend:getConfig',
  resendSaveConfig: 'resend:saveConfig',
  resendTestConnection: 'resend:testConnection',
  resendRemoveKey: 'resend:removeKey',
  prefsGet: 'settings:get',
  prefsSave: 'settings:save',
  emailSendTest: 'email:sendTest',
  campaignStart: 'campaign:start',
  campaignPause: 'campaign:pause',
  campaignResume: 'campaign:resume',
  campaignCancel: 'campaign:cancel',
  campaignGet: 'campaign:get',
  campaignList: 'campaign:list',
  campaignDelete: 'campaign:delete',
  campaignRetryFailed: 'campaign:retryFailed',
  campaignProgress: 'campaign:progress',
  reportExport: 'report:export',
  appInfo: 'app:info',
  openExternal: 'app:openExternal'
} as const

export interface StartCampaignInput {
  subject: string
  html: string
  recipients: Recipient[]
  sourceFile: string
}

export interface AppInfo {
  version: string
  platform: string
  arch: string
  dataPath: string
}

/** The API exposed on window.api by the preload script. */
export interface BulkMailerApi {
  auth: {
    status(): Promise<IpcResult<AuthStatus>>
    setup(input: { username: string; password: string; confirmPassword: string }): Promise<IpcResult<AuthStatus>>
    login(input: { username: string; password: string }): Promise<IpcResult<AuthStatus>>
    logout(): Promise<IpcResult<AuthStatus>>
    changePassword(input: {
      currentPassword: string
      newPassword: string
      confirmPassword: string
    }): Promise<IpcResult<null>>
    resetApp(): Promise<IpcResult<AuthStatus>>
    activity(): void
    onLocked(cb: () => void): () => void
  }
  file: {
    open(): Promise<IpcResult<string | null>>
    pathFor(file: File): string
  }
  excel: {
    parse(input: { path: string; mapping?: { name: string | null; email: string } }): Promise<IpcResult<ParseResult>>
    saveSample(): Promise<IpcResult<string | null>>
  }
  resend: {
    getConfig(): Promise<IpcResult<ResendSettingsView>>
    saveConfig(input: ResendConfigInput): Promise<IpcResult<ResendSettingsView>>
    testConnection(): Promise<IpcResult<ConnectionResult>>
    removeKey(): Promise<IpcResult<ResendSettingsView>>
  }
  settings: {
    get(): Promise<IpcResult<Preferences>>
    save(input: Preferences): Promise<IpcResult<Preferences>>
  }
  email: {
    sendTest(input: { to: string; subject: string; html: string; sample?: Recipient }): Promise<IpcResult<{ id: string }>>
  }
  campaign: {
    start(input: StartCampaignInput): Promise<IpcResult<CampaignSummary>>
    pause(id: string): Promise<IpcResult<CampaignSummary>>
    resume(id: string): Promise<IpcResult<CampaignSummary>>
    cancel(id: string): Promise<IpcResult<CampaignSummary>>
    get(id: string): Promise<IpcResult<CampaignDetail>>
    list(): Promise<IpcResult<CampaignSummary[]>>
    remove(id: string): Promise<IpcResult<null>>
    retryFailed(id: string): Promise<IpcResult<CampaignSummary>>
    onProgress(cb: (p: CampaignProgress) => void): () => void
  }
  report: {
    export(input: { campaignId: string; format: 'csv' | 'xlsx'; filter?: 'all' | 'sent' | 'failed' }): Promise<
      IpcResult<string | null>
    >
  }
  app: {
    info(): Promise<IpcResult<AppInfo>>
    openExternal(url: string): Promise<IpcResult<null>>
  }
}
