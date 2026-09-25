import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileBarChart, Loader2, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CampaignSummary } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CampaignStatusBadge } from '@/components/common/StatusBadge'
import { Page, PageHeader } from '@/components/layout/PageHeader'
import { api, call, errorMessage } from '@/lib/api'
import { formatDate, nf } from '@/lib/format'
import { useCampaign } from '@/store/campaign'

export default function HistoryPage(): React.JSX.Element {
  const navigate = useNavigate()
  const setCurrent = useCampaign((s) => s.setCurrent)
  const current = useCampaign((s) => s.current)
  const [list, setList] = useState<CampaignSummary[] | null>(null)

  const load = useCallback(() => {
    call(api.campaign.list())
      .then(setList)
      .catch((e) => toast.error(errorMessage(e)))
  }, [])

  useEffect(load, [load, current?.status])

  const resume = async (id: string): Promise<void> => {
    try {
      await call(api.campaign.resume(id))
      setCurrent(await call(api.campaign.get(id)))
      navigate('/send')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const remove = async (id: string): Promise<void> => {
    try {
      await call(api.campaign.remove(id))
      if (current?.id === id) setCurrent(null)
      load()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Page>
      <PageHeader title="History" description="Every campaign sent from this computer." />
      <Card className="py-0">
        <CardContent className="p-0">
          {!list ? (
            <div className="p-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : list.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No campaigns yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4 whitespace-nowrap">{formatDate(c.createdAt)}</TableCell>
                    <TableCell className="max-w-64 truncate">
                      {c.retryOf ? <span className="mr-1 text-xs text-muted-foreground">[retry]</span> : null}
                      {c.subject}
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground">{c.sourceFile}</TableCell>
                    <TableCell>
                      <CampaignStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{nf.format(c.sent)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf.format(c.failed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf.format(c.total)}</TableCell>
                    <TableCell className="pr-4 text-right whitespace-nowrap">
                      {c.status === 'interrupted' || c.status === 'stopped' ? (
                        <Button size="sm" variant="ghost" onClick={() => void resume(c.id)}>
                          <Play /> Resume
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/report/${c.id}`)}>
                        <FileBarChart /> Report
                      </Button>
                      {c.status !== 'running' && c.status !== 'paused' ? (
                        <ConfirmDialog
                          trigger={
                            <Button size="icon" variant="ghost" aria-label="Delete">
                              <Trash2 />
                            </Button>
                          }
                          title="Delete this campaign?"
                          description="Its report and recipient list are removed from this computer."
                          confirmLabel="Delete"
                          destructive
                          onConfirm={() => void remove(c.id)}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Page>
  )
}
