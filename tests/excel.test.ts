import './electron-mock'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { userData } from './electron-mock'
import { parseRecipients } from '../src/main/services/excel.service'

function csv(name: string, content: string): string {
  const p = join(userData, name)
  writeFileSync(p, content, 'utf8')
  return p
}

describe('parseRecipients', () => {
  it('splits valid, invalid and duplicate rows', () => {
    const p = csv(
      'a.csv',
      'Name , E-Mail\nRahim Uddin, RAHIM@Example.com \nBad,not-an-email\nEmpty,\nDup,rahim@example.com\nকরিম,karim@example.com\n'
    )
    // "E-Mail" normalizes to "email"
    const r = parseRecipients(p)
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(r.valid.map((v) => v.email)).toEqual(['rahim@example.com', 'karim@example.com'])
    expect(r.valid[1].name).toBe('করিম')
    expect(r.invalid.map((i) => i.reason)).toEqual(['Invalid email format', 'Empty email'])
    expect(r.duplicates).toEqual([{ row: 5, email: 'rahim@example.com', name: 'Dup', firstRow: 2 }])
  })

  it('asks for mapping when no email column exists', () => {
    const p = csv('b.csv', 'Customer,Contact\nA,a@x.io\nB,b@x.io\n')
    const r = parseRecipients(p)
    expect(r.kind).toBe('needsMapping')
    if (r.kind === 'needsMapping') expect(r.guess.email).toBe('Contact')
    const mapped = parseRecipients(p, { email: 'Contact', name: 'Customer' })
    if (mapped.kind !== 'ok') throw new Error('expected ok')
    expect(mapped.valid[0]).toMatchObject({ name: 'A', email: 'a@x.io', fields: { customer: 'A', contact: 'a@x.io' } })
  })

  it('reads xlsx files and exposes extra columns', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['name', 'email', 'Company Name'],
      ['A', 'a@x.io', 'Acme']
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'S')
    const p = join(userData, 'c.xlsx')
    writeFileSync(p, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer)
    const r = parseRecipients(p)
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(r.variables).toContain('company_name')
    expect(r.valid[0].fields.company_name).toBe('Acme')
  })

  it('rejects other file types', () => {
    expect(() => parseRecipients(csv('d.txt', 'x'))).toThrow(/Only .xlsx/)
  })
})
