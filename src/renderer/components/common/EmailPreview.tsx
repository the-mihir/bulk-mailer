import { useMemo } from 'react'
import { renderHtml, renderSubject } from '@shared/template'
import type { Recipient } from '@shared/types'

/**
 * The body renders inside a sandboxed iframe with no permissions:
 * no scripts, no forms, no navigation, and an opaque origin.
 */
export function EmailPreview({
  subject,
  html,
  recipient,
  fallback,
  from,
  height = 460
}: {
  subject: string
  html: string
  recipient: Pick<Recipient, 'name' | 'email' | 'fields'>
  fallback: string
  from?: string
  height?: number
}): React.JSX.Element {
  const doc = useMemo(() => {
    const body = renderHtml(html, recipient, fallback)
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#111;background:#fff;margin:16px;word-wrap:break-word}img{max-width:100%}</style>
</head><body>${body}</body></html>`
  }, [html, recipient, fallback])

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="space-y-1 border-b bg-muted/50 px-4 py-3 text-sm">
        {from ? (
          <div className="truncate">
            <span className="text-muted-foreground">From: </span>
            {from}
          </div>
        ) : null}
        <div className="truncate">
          <span className="text-muted-foreground">To: </span>
          {recipient.email}
        </div>
        <div className="truncate font-medium">
          <span className="font-normal text-muted-foreground">Subject: </span>
          {renderSubject(subject, recipient, fallback) || <em className="text-muted-foreground">(no subject)</em>}
        </div>
      </div>
      <iframe title="Email preview" sandbox="" srcDoc={doc} className="w-full bg-white" style={{ height }} />
    </div>
  )
}
