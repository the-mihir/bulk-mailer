import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Ban, CheckCircle2, FileBarChart, Loader2, Pause, Play, XCircle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import type { RecipientResult } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CampaignStatusBadge, RecipientStatusBadge } from '@/components/common/StatusBadge'
import { VirtualTable, type Column } from '@/components/common/VirtualTable'
import { Page, PageHeader } from '@/components/layout/PageHeader'
import { api, call, errorMessage } from '@/lib/api'
import { formatTime, nf } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCampaign } from '@/store/campaign'

const columns: Column<RecipientResult>[] = [
  { key: 'row', header: 'Row', className: 'w-16 text-muted-foreground', cell: (r) => r.row },
  { key: 'email', header: 'Email', cell: (r) => r.email },
  { key: 'name', header: 'Name', cell: (r) => r.name },
  { key: 'status', header: 'Status', className: 'w-24', cell: (r) => <RecipientStatusBadge status={r.status} /> },
  { key: 'detail', header: 'Detail', cell: (r) => <span className="text-xs text-muted-foreground">{r.error ?? r.id ?? ''}</span> }
]

export default function SendPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { current, setCurrent } = useCampaign()
  const [loading, setLoading] = useState(!current)
  const [acting, setActing] = useState(false)
  const logEnd = useRef<HTMLDivElement>(null)

  // Opened directly (e.g. after auto-lock): attach to the active campaign, if any.
  useEffect(() => {
    if (current) {
      call(api.campaign.get(current.id)).then(setCurrent).catch(() => {})
      setLoading(false)
      return
    }
    call(api.campaign.list())
      .then(async (list) => {
        const active = list.find((c) => c.status === 'running' || c.status === 'paused')
        if (active) setCurrent(await call(api.campaign.get(active.id)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'end' })
  }, [current?.log.length])

  const processed = useMemo(() => (current ? current.sent + current.failed : 0), [current])

  if (loading) return <Page><Loader2 className="size-6 animate-spin text-muted-foreground" /></Page>

  if (!current) {
    return (
      <Page>
        <PageHeader title="Send" />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No campaign is running. Start one from <Link className="underline" to="/review">Review &amp; Test</Link>.
          </CardContent>
        </Card>
      </Page>
    )
  }

  const pct = current.total ? Math.round((processed / current.total) * 100) : 0
  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    setActing(true)
    try {
      await fn()
      setCurrent(await call(api.campaign.get(current.id)))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setActing(false)
    }
  }
  const resumable = ['paused', 'interrupted', 'stopped'].includes(current.status)
  const active = current.status === 'running' || current.status === 'paused'

  return (
    <Page>
      <PageHeader
        title="Sending"
        description={<span className="truncate">{current.subject}</span>}
        actions={
          <>
            {current.status === 'running' ? (
              <Button variant="outline" disabled={acting} onClick={() => void act(() => call(api.campaign.pause(current.id)))}>
                <Pause /> Pause
              </Button>
            ) : null}
            {resumable ? (
              <Button disabled={acting} onClick={() => void act(() => call(api.campaign.resume(current.id)))}>
                <Play /> Resume
              </Button>
            ) : null}
            {active ? (
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" disabled={acting}>
                    <Ban /> Cancel
                  </Button>
                }
                title="Cancel this campaign?"
                description="Emails already sent stay sent. The rest are not sent. You can retry them later from the report."
                confirmLabel="Cancel campaign"
                destructive
                onConfirm={() => void act(() => call(api.campaign.cancel(current.id)))}
              />
            ) : null}
            {!active ? (
              <Button variant="outline" onClick={() => navigate(`/report/${current.id}`)}>
                <FileBarChart /> Report
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="mb-6">
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <CampaignStatusBadge status={current.status} />
            <span className="text-sm text-muted-foreground tabular-nums">
              Batch {Math.min(current.nextBatch + (current.status === 'running' ? 1 : 0), current.totalBatches)} / {current.totalBatches}
            </span>
          </div>
          <Progress value={pct} className="h-3" />
          <div className="grid grid-cols-4 gap-4 text-center">
            <Counter icon={CheckCircle2} label="Sent" value={current.sent} className="text-success" />
            <Counter icon={XCircle} label="Failed" value={current.failed} className="text-destructive" />
            <Counter icon={Clock} label="Pending" value={current.total - processed} className="text-muted-foreground" />
            <Counter label="Progress" value={`${pct}%`} />
          </div>
          {current.statusReason && current.status !== 'completed' ? (
            <p className={cn('rounded-md border p-3 text-sm', current.status === 'stopped' ? 'border-destructive/40 text-destructive' : 'border-warning/40 text-warning')}>
              {current.statusReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <VirtualTable rows={current.results} columns={columns} rowKey={(r) => `${r.row}:${r.email}`} height={440} />
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-base">Live log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[360px] overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs">
              {current.log.length === 0 ? <p className="text-muted-foreground">Waiting for events…</p> : null}
              {current.log.map((l) => (
                <div
                  key={l.seq}
                  className={cn('py-0.5', l.level === 'error' && 'text-destructive', l.level === 'warn' && 'text-warning')}
                >
                  <span className="text-muted-foreground">{formatTime(l.at)}</span> {l.message}
                </div>
              ))}
              <div ref={logEnd} />
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}

function Counter({
  icon: Icon,
  label,
  value,
  className
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  className?: string
}): React.JSX.Element {
  return (
    <div>
      <div className={cn('flex items-center justify-center gap-1.5 text-2xl font-semibold tabular-nums', className)}>
        {Icon ? <Icon className="size-5" /> : null}
        {typeof value === 'number' ? nf.format(value) : value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
