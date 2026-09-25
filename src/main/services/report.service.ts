import { writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import type { CampaignDetail } from '@shared/types'

export function buildReport(c: CampaignDetail, filter: 'all' | 'sent' | 'failed'): XLSX.WorkBook {
  const rows = c.results
    .filter((r) => filter === 'all' || r.status === filter)
    .map((r) => ({
      row: r.row,
      email: r.email,
      name: r.name,
      status: r.status,
      resend_id: r.id ?? '',
      error: r.error ?? '',
      sent_at: r.sentAt ? new Date(r.sentAt).toISOString() : ''
    }))
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ['row', 'email', 'name', 'status', 'resend_id', 'error', 'sent_at']
  })
  ws['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 24 }, { wch: 9 }, { wch: 38 }, { wch: 48 }, { wch: 26 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  return wb
}

export function writeReport(wb: XLSX.WorkBook, path: string, format: 'csv' | 'xlsx'): void {
  if (format === 'csv') {
    // BOM so Excel opens UTF-8 names (e.g. Bangla) correctly.
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]])
    writeFileSync(path, '\uFEFF' + csv, 'utf8')
    return
  }
  writeFileSync(path, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true }) as Buffer)
}
