import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { CH } from '@shared/ipc'
import { parseRequestSchema } from '@shared/schemas'
import { handle, noInput } from '../middleware/requireAuth'
import { parseRecipients, sampleWorkbook } from '../services/excel.service'

export function registerExcelIpc(): void {
  handle(CH.fileOpen, noInput, async (_i, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose recipients file',
      properties: ['openFile'],
      filters: [{ name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  handle(CH.excelParse, parseRequestSchema, (i) => parseRecipients(i.path, i.mapping))

  handle(CH.excelSample, noInput, async (_i, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts: Electron.SaveDialogOptions = {
      title: 'Save sample file',
      defaultPath: 'recipients-sample.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, XLSX.write(sampleWorkbook(), { bookType: 'xlsx', type: 'buffer' }) as Buffer)
    return res.filePath
  })
}
