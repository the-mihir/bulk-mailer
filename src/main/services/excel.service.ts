import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import * as XLSX from 'xlsx'
import { LIMITS, emailSchema } from '@shared/schemas'
import { normalizeKey } from '@shared/template'
import type { DuplicateRow, InvalidRow, ParseResult, Recipient } from '@shared/types'
import { UserError } from '../middleware/requireAuth'

const ALLOWED = new Set(['.xlsx', '.xls', '.csv'])
const EMAIL_HEADERS = ['email', 'email_address', 'emailaddress', 'e_mail', 'mail']
const NAME_HEADERS = ['name', 'full_name', 'fullname', 'customer_name', 'first_name', 'contact_name']
const MAX_CELL = 2000

export interface ColumnMapping {
  name: string | null
  email: string
}

/** Reads the first sheet and returns its rows as trimmed strings. */
export function readRows(path: string): { headers: string[]; rows: string[][] } {
  const ext = extname(path).toLowerCase()
  if (!ALLOWED.has(ext)) throw new UserError('Only .xlsx, .xls and .csv files are supported.')

  let size: number
  try {
    size = statSync(path).size
  } catch {
    throw new UserError('File not found or not readable.')
  }
  if (size > LIMITS.maxFileBytes) throw new UserError('File is larger than 25 MB.')
  if (size === 0) throw new UserError('File is empty.')

  const buf = readFileSync(path)
  let wb: XLSX.WorkBook
  try {
    wb =
      ext === '.csv'
        ? // Read CSV as UTF-8 text so non-Latin names (e.g. Bangla) survive.
          XLSX.read(buf.toString('utf8').replace(/^﻿/, ''), { type: 'string', raw: true, dense: true })
        : XLSX.read(buf, { type: 'buffer', dense: true, cellFormula: false, cellHTML: false })
  } catch {
    throw new UserError('Could not read the file. Is it a valid spreadsheet?')
  }

  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new UserError('The file has no sheets.')
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false
  })
  if (matrix.length === 0) throw new UserError('The first sheet is empty.')

  const headers = matrix[0].map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`)
  const rows = matrix.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? '').trim().slice(0, MAX_CELL)))
  return { headers, rows }
}

function findColumn(keys: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = keys.indexOf(c)
    if (i >= 0) return i
  }
  return -1
}

/** Best guess for the email column: the one where most cells contain "@". */
function guessEmailColumn(rows: string[][], count: number): number {
  let best = -1
  let bestHits = 0
  const sample = rows.slice(0, 200)
  for (let c = 0; c < count; c++) {
    const hits = sample.filter((r) => r[c]?.includes('@')).length
    if (hits > bestHits) {
      best = c
      bestHits = hits
    }
  }
  return best
}

/** Unique normalized keys for every header, used as {{placeholders}}. */
function headerKeys(headers: string[]): string[] {
  const seen = new Map<string, number>()
  return headers.map((h, i) => {
    const base = normalizeKey(h) || `column_${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}_${n}`
  })
}

export function parseRecipients(path: string, mapping?: ColumnMapping): ParseResult {
  const fileName = basename(path)
  const { headers, rows } = readRows(path)
  const keys = headerKeys(headers)

  let emailCol: number
  let nameCol: number
  if (mapping) {
    emailCol = headers.indexOf(mapping.email)
    nameCol = mapping.name ? headers.indexOf(mapping.name) : -1
    if (emailCol < 0) throw new UserError(`Column "${mapping.email}" not found.`)
  } else {
    emailCol = findColumn(keys, EMAIL_HEADERS)
    nameCol = findColumn(keys, NAME_HEADERS)
    if (emailCol < 0) {
      const g = guessEmailColumn(rows, headers.length)
      return {
        kind: 'needsMapping',
        fileName,
        headers,
        guess: { email: g >= 0 ? headers[g] : null, name: nameCol >= 0 ? headers[nameCol] : null }
      }
    }
  }

  const truncated = rows.length > LIMITS.maxRows
  const valid: Recipient[] = []
  const invalid: InvalidRow[] = []
  const duplicates: DuplicateRow[] = []
  const firstSeen = new Map<string, number>()

  rows.slice(0, LIMITS.maxRows).forEach((cells, i) => {
    const row = i + 2 // header is row 1
    const rawEmail = cells[emailCol] ?? ''
    const name = nameCol >= 0 ? (cells[nameCol] ?? '').slice(0, 200) : ''

    if (!rawEmail) {
      invalid.push({ row, email: '', name, reason: 'Empty email' })
      return
    }
    const parsed = emailSchema.safeParse(rawEmail)
    if (!parsed.success) {
      invalid.push({ row, email: rawEmail, name, reason: 'Invalid email format' })
      return
    }
    const email = parsed.data
    const first = firstSeen.get(email)
    if (first !== undefined) {
      duplicates.push({ row, email, name, firstRow: first })
      return
    }
    firstSeen.set(email, row)

    const fields: Record<string, string> = {}
    keys.forEach((k, c) => (fields[k] = cells[c] ?? ''))
    valid.push({ row, email, name, fields })
  })

  return {
    kind: 'ok',
    fileName,
    headers,
    variables: [...new Set(['name', 'email', ...keys])],
    valid,
    invalid,
    duplicates,
    truncated
  }
}

export function sampleWorkbook(): XLSX.WorkBook {
  const ws = XLSX.utils.aoa_to_sheet([
    ['name', 'email', 'company'],
    ['Rahim Uddin', 'rahim@example.com', 'Plexora Lab'],
    ['Karima Begum', 'karima@example.com', 'Acme Ltd'],
    ['', 'no-name@example.com', '']
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Recipients')
  return wb
}
