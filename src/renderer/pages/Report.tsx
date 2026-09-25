import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, Download, Filter, Loader2, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { CampaignDetail, RecipientResult, RecipientStatus } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CampaignStatusBadge, RecipientStatusBadge } from '@/components/common/StatusBadge'
import { VirtualTable, type Column } from '@/components/common/VirtualTable'
import { Page, PageHeader } from '@/components/layout/PageHeader'
import { api, call, errorMessage } from '@/lib/api'
import { formatDate, nf } from '@/lib/format'
import { useCampaign } from '@/store/campaign'

type FilterValue = 'all' | RecipientStatus

const columns: Column<RecipientResult>[] = [
  { key: 'row', header: 'Row', className: 'w-16 text-muted-foreground', cell: (r) => r.row },
  { key: 'email', header: 'Email', cell: (r) => r.email },
  { key: 'name', header: 'Name', cell: (r) => r.name },
  { key: 'status', header: 'Status', className: 'w-24', cell: (r) => <RecipientStatusBadge status={r.status} /> },
  { key: 'id', header: 'Resend ID', cell: (r) => <span className="font-mono text-xs">{r.id ?? ''}</span> },
  { key: 'error', header: 'Error', cell: (r) => <span className="text-xs text-destructive">{r.error ?? ''}</span> }
]

export default function ReportPage(): React.JSX.Element {
  const { id } = useParams()
  const navigate = useNavigate()
  const { current, setCurrent } = useCampaign()
  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterValue>('all')
  const [query, setQuery] = useState('')

  const campaignId = id ?? current?.id

  useEffect(() => {
    if (!campaignId) {
      setLoading(false)
      return
    }
    setLoading(true)
    call(api.campaign.get(campaignId))
      .then(setDetail)
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [campaignId])

  // Keep in sync while this campaign is still sending.
  const live = current && detail && current.id === detail.id ? current : detail

  const rows = useMemo(() => {
    if (!live) return []
    const q = query.trim().toLowerCase()
    return live.results.filter(
      (r) => (filter === 'all' || r.status === filter) && (!q || r.email.includes(q) || r.name.toLowerCase().includes(q))
    )
  }, [live, filter, query])

  if (loading) return <Page><Loader2 className="size-6 animate-spin text-muted-foreground" /></Page>
  if (!live) {
    return (
      <Page>
        <PageHeader title="Report" />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No campaign selected. Open one from <Link to="/history" className="underline">History</Link>.
          </CardContent>
        </Card>
      </Page>
    )
  }

  const exportReport = async (format: 'csv' | 'xlsx', which: 'all' | 'sent' | 'failed'): Promise<void> => {
    try {
      const path = await call(api.report.export({ campaignId: live.id, format, filter: which }))
      if (path) toast.success(`Saved ${path}`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const unsent = live.total - live.sent
  const active = live.status === 'running' || live.status === 'paused'

  const retry = async (): Promise<void> => {
    try {
      const s = await call(api.campaign.retryFailed(live.id))
      setCurrent(await call(api.campaign.get(s.id)))
      navigate('/send')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Page>
      <PageHeader
        title="Report"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CampaignStatusBadge status={live.status} /> {live.subject} · {live.sourceFile} · {formatDate(live.createdAt)}
          </span>
        }
        actions={
          <>
            {unsent > 0 && !active ? (
              <ConfirmDialog
                trigger={
                  <Button variant="outline">
                    <RotateCcw /> Retry {nf.format(unsent)} unsent
                  </Button>
                }
                title={`Retry ${nf.format(unsent)} recipient(s)?`}
                description="Starts a new campaign with the failed and pending recipients, using the same subject and body and your current settings."
                confirmLabel="Retry"
                onConfirm={() => void retry()}
              />
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Download /> Export <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(['all', 'sent', 'failed'] as const).map((w) => (
                  <div key={w}>
                    <DropdownMenuLabel className="capitalize">{w === 'all' ? 'All rows' : `${w} only`}</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => void exportReport('xlsx', w)}>Excel (.xlsx)</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void exportReport('csv', w)}>CSV (.csv)</DropdownMenuItem>
                    {w !== 'failed' ? <DropdownMenuSeparator /> : null}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Tile label="Total" value={live.total} />
        <Tile label="Sent" value={live.sent} className="text-success" />
        <Tile label="Failed" value={live.failed} className="text-destructive" />
        <Tile label="Pending" value={live.total - live.sent - live.failed} />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search email or name" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Filter /> {filter === 'all' ? 'All statuses' : filter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
              <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="sent">Sent</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="failed">Failed</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="pending">Pending</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-sm text-muted-foreground">{nf.format(rows.length)} row(s)</span>
      </div>

      <VirtualTable rows={rows} columns={columns} rowKey={(r) => `${r.row}:${r.email}`} height={480} empty="No rows match." />
    </Page>
  )
}

function Tile({ label, value, className }: { label: string; value: number; className?: string }): React.JSX.Element {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold tabular-nums ${className ?? ''}`}>{nf.format(value)}</p>
      </CardContent>
    </Card>
  )
}
