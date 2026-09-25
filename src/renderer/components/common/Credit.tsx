import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export const AUTHOR = { name: 'Mihir Das', site: 'mihirdas.io', url: 'https://mihirdas.io' }

export function Credit({ className }: { className?: string }): React.JSX.Element {
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      Built by {AUTHOR.name} ·{' '}
      <button
        type="button"
        className="underline-offset-4 hover:text-foreground hover:underline"
        onClick={() => void api.app.openExternal(AUTHOR.url)}
      >
        {AUTHOR.site}
      </button>
    </p>
  )
}
