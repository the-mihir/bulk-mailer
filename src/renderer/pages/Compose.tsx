import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Bold, ChevronLeft, ChevronRight, Heading2, Italic, Link2, List, Pilcrow, Braces } from 'lucide-react'
import { placeholdersIn } from '@shared/template'
import { composeSchema } from '@shared/schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmailPreview } from '@/components/common/EmailPreview'
import { Page, PageHeader } from '@/components/layout/PageHeader'
import { useCampaign } from '@/store/campaign'

const SAMPLE = { name: 'Rahim Uddin', email: 'rahim@example.com', fields: {}, row: 2 }

type Target = 'subject' | 'html'

export default function ComposePage(): React.JSX.Element {
  const navigate = useNavigate()
  const { subject, html, setCompose, imported, settings } = useCampaign()
  const [index, setIndex] = useState(0)
  const [lastFocus, setLastFocus] = useState<Target>('html')
  const subjectRef = useRef<HTMLInputElement>(null)
  const htmlRef = useRef<HTMLTextAreaElement>(null)

  const recipients = imported?.valid ?? []
  const sample = recipients[Math.min(index, recipients.length - 1)] ?? SAMPLE
  const variables = imported?.variables ?? ['name', 'email']
  const fallback = settings?.nameFallback ?? 'there'

  const unknown = useMemo(() => {
    const used = new Set([...placeholdersIn(subject), ...placeholdersIn(html)])
    return [...used].filter((v) => !variables.includes(v))
  }, [subject, html, variables])

  const valid = composeSchema.safeParse({ subject, html })

  /** Replace the current selection in the subject or body. */
  const edit = (target: Target, fn: (selected: string) => string): void => {
    const el = target === 'subject' ? subjectRef.current : htmlRef.current
    if (!el) return
    const value = target === 'subject' ? subject : html
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const insert = fn(value.slice(start, end))
    const next = value.slice(0, start) + insert + value.slice(end)
    if (target === 'subject') setCompose(next, html)
    else setCompose(subject, next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + insert.length, start + insert.length)
    })
  }

  const wrap = (open: string, close: string, placeholder = 'text') => () =>
    edit('html', (sel) => `${open}${sel || placeholder}${close}`)

  return (
    <Page>
      <PageHeader
        title="Compose"
        description={
          <>
            Use <code className="rounded bg-muted px-1">{'{{name}}'}</code> or any column name as a placeholder. Values are HTML-escaped. A plain-text
            version is generated automatically.
          </>
        }
        actions={
          <Button onClick={() => navigate('/review')} disabled={!valid.success || recipients.length === 0}>
            Review <ArrowRight />
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                ref={subjectRef}
                value={subject}
                placeholder="Hi {{name}}, a quick update"
                onFocus={() => setLastFocus('subject')}
                onChange={(e) => setCompose(e.target.value, html)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Body (HTML)</Label>
              <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1">
                <ToolButton label="Bold" onClick={wrap('<strong>', '</strong>')} icon={Bold} />
                <ToolButton label="Italic" onClick={wrap('<em>', '</em>')} icon={Italic} />
                <ToolButton label="Heading" onClick={wrap('<h2>', '</h2>', 'Heading')} icon={Heading2} />
                <ToolButton label="Paragraph" onClick={wrap('<p>', '</p>', 'Paragraph')} icon={Pilcrow} />
                <ToolButton label="List" onClick={wrap('<ul>\n  <li>', '</li>\n</ul>', 'Item')} icon={List} />
                <ToolButton
                  label="Link"
                  onClick={() => edit('html', (sel) => `<a href="https://">${sel || 'link text'}</a>`)}
                  icon={Link2}
                />
                <div className="mx-1 h-5 w-px bg-border" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm">
                      <Braces /> Insert variable
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="max-h-72 overflow-y-auto">
                    {variables.map((v) => (
                      <DropdownMenuItem key={v} onSelect={() => edit(lastFocus, () => `{{${v}}}`)}>
                        <code>{`{{${v}}}`}</code>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Textarea
                id="body"
                ref={htmlRef}
                value={html}
                onFocus={() => setLastFocus('html')}
                onChange={(e) => setCompose(subject, e.target.value)}
                spellCheck={false}
                className="min-h-80 font-mono text-sm"
              />
            </div>
            {unknown.length ? (
              <p className="flex items-start gap-2 text-sm text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Not in your file, so they render empty: {unknown.map((u) => `{{${u}}}`).join(', ')}
              </p>
            ) : null}
            {!valid.success ? <p className="text-sm text-destructive">{valid.error.issues[0]?.message}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Live preview</CardTitle>
            {recipients.length > 1 ? (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Button variant="ghost" size="icon" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
                  <ChevronLeft />
                </Button>
                {index + 1} / {recipients.length}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIndex((i) => Math.min(recipients.length - 1, i + 1))}
                  disabled={index >= recipients.length - 1}
                >
                  <ChevronRight />
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            <EmailPreview
              subject={subject}
              html={html}
              recipient={sample}
              fallback={fallback}
              from={settings?.fromEmail ? `${settings.fromName} <${settings.fromEmail}>` : undefined}
            />
            {recipients.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Showing sample data. Import a file to preview real rows.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}

function ToolButton({
  label,
  icon: Icon,
  onClick
}: {
  label: string
  icon: React.ComponentType
  onClick: () => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClick} aria-label={label}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
