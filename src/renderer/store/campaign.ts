import { create } from 'zustand'
import type {
  CampaignDetail,
  CampaignProgress,
  DuplicateRow,
  InvalidRow,
  LogEntry,
  Recipient,
  ResendSettingsView
} from '@shared/types'

const DRAFT_KEY = 'bulk-mailer-draft'

export const DEFAULT_HTML = `<p>Hi {{name}},</p>
<p>Write your message here.</p>
<p>Thanks,<br/>Your team</p>`

function loadDraft(): { subject: string; html: string } {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as { subject?: string; html?: string }
    return { subject: d.subject ?? '', html: d.html ?? DEFAULT_HTML }
  } catch {
    return { subject: '', html: DEFAULT_HTML }
  }
}

function saveDraft(subject: string, html: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject, html }))
  } catch {
    /* ignore */
  }
}

export interface ImportState {
  fileName: string
  headers: string[]
  variables: string[]
  valid: Recipient[]
  invalid: InvalidRow[]
  duplicates: DuplicateRow[]
  truncated: boolean
}

interface CampaignStore {
  imported: ImportState | null
  subject: string
  html: string
  settings: ResendSettingsView | null
  /** Campaign shown on the Send / Report pages. */
  current: CampaignDetail | null

  setImported: (i: ImportState | null) => void
  setCompose: (subject: string, html: string) => void
  setSettings: (s: ResendSettingsView) => void
  setCurrent: (c: CampaignDetail | null) => void
  applyProgress: (p: CampaignProgress) => void
  reset: () => void
}

export const useCampaign = create<CampaignStore>((set, get) => ({
  imported: null,
  ...loadDraft(),
  settings: null,
  current: null,

  setImported: (imported) => set({ imported }),
  setCompose: (subject, html) => {
    saveDraft(subject, html)
    set({ subject, html })
  },
  setSettings: (settings) => set({ settings }),
  setCurrent: (current) => set({ current }),
  applyProgress: (p) => {
    const cur = get().current
    if (!cur || cur.id !== p.campaign.id) return
    let results = cur.results
    if (p.changed.length) {
      const byRow = new Map(p.changed.map((r) => [`${r.row}:${r.email}`, r]))
      results = results.map((r) => byRow.get(`${r.row}:${r.email}`) ?? r)
    }
    const lastSeq = cur.log.at(-1)?.seq ?? 0
    const fresh = p.log.filter((l) => l.seq > lastSeq)
    const log: LogEntry[] = fresh.length ? [...cur.log, ...fresh].slice(-500) : cur.log
    set({ current: { ...cur, ...p.campaign, results, log } })
  },
  reset: () => set({ imported: null, current: null, settings: null })
}))
