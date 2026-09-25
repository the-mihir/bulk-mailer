import { BrowserWindow, dialog } from 'electron'
import { CH } from '@shared/ipc'
import { exportSchema, idSchema, startCampaignSchema } from '@shared/schemas'
import { handle, noInput } from '../middleware/requireAuth'
import * as campaigns from '../services/campaign.service'
import { buildReport, writeReport } from '../services/report.service'

export function registerCampaignIpc(): void {
  handle(CH.campaignStart, startCampaignSchema, (i) => campaigns.start(i))
  handle(CH.campaignPause, idSchema, (id) => campaigns.pause(id))
  handle(CH.campaignResume, idSchema, (id) => campaigns.resume(id))
  handle(CH.campaignCancel, idSchema, (id) => campaigns.cancel(id))
  handle(CH.campaignGet, idSchema, (id) => campaigns.get(id))
  handle(CH.campaignList, noInput, () => campaigns.list())
  handle(CH.campaignRetryFailed, idSchema, (id) => campaigns.retryFailed(id))
  handle(CH.campaignDelete, idSchema, (id) => {
    campaigns.remove(id)
    return null
  })

  handle(CH.reportExport, exportSchema, async (i, event) => {
    const c = campaigns.get(i.campaignId)
    const win = BrowserWindow.fromWebContents(event.sender)
    const stamp = new Date(c.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const opts: Electron.SaveDialogOptions = {
      title: 'Export report',
      defaultPath: `bulk-mailer-report-${stamp}-${i.filter}.${i.format}`,
      filters: [i.format === 'csv' ? { name: 'CSV', extensions: ['csv'] } : { name: 'Excel', extensions: ['xlsx'] }]
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    writeReport(buildReport(c, i.filter), res.filePath, i.format)
    return res.filePath
  })
}
