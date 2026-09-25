import { Badge } from '@/components/ui/badge'
import type { CampaignStatus, RecipientStatus } from '@shared/types'

const CAMPAIGN: Record<CampaignStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'default' }> = {
  running: { label: 'Running', variant: 'default' },
  paused: { label: 'Paused', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
  stopped: { label: 'Stopped', variant: 'destructive' },
  interrupted: { label: 'Interrupted', variant: 'warning' }
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }): React.JSX.Element {
  const c = CAMPAIGN[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}

export function RecipientStatusBadge({ status }: { status: RecipientStatus }): React.JSX.Element {
  if (status === 'sent') return <Badge variant="success">Sent</Badge>
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>
  return <Badge variant="secondary">Pending</Badge>
}
