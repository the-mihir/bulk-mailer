import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, Loader2, Rocket, Send } from 'lucide-react'
import { toast } from 'sonner'
import { composeSchema, emailSchema } from '@shared/schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmailPreview } from '@/components/common/EmailPreview'
import { Page, PageHeader } from '@/components/layout/PageHeader'
import { api, call, errorMessage } from '@/lib/api'
import { formatDuration, nf } from '@/lib/format'
import { useCampaign } from '@/store/campaign'

export default function ReviewPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { imported, subject, html, settings, setSettings, setCurrent, current } = useCampaign()
  const [testTo, setTestTo] = useState(settings?.lastTestRecipient || settings?.replyTo || '')
  const [sendingTest, setSendingTest] = useState(false)
  const [starting, setStarting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    call(api.resend.getConfig())
      .then((s) => {
        setSettings(s)
        setTestTo((t) => t || s.lastTestRecipient || s.replyTo || s.fromEmail)
      })
      .catch(() => {})
  }, [setSettings])

  const count = imported?.valid.length ?? 0
  const batchSize = settings?.batchSize ?? 100
  const rps = settings?.requestsPerSecond ?? 2
  const batches = Math.ceil(count / batchSize)
  const seconds = batches / rps + batches * 0.4
  const composeOk = composeSchema.safeParse({ subject, html }).success
  const busy = current?.status === 'running' || current?.status === 'paused'

  const checks = [
    { ok: !!settings?.verified, label: 'Resend connection verified', to: '/settings' },
    { ok: count > 0, label: `${nf.format(count)} valid recipient(s)`, to: '/import' },
    { ok: composeOk, label: 'Subject and body ready', to: '/compose' },
    { ok: !busy, label: 'No other campaign running', to: '/send' }
  ]
  const ready = checks.every((c) => c.ok)

  const sendTest = async (): Promise<void> => {
    const to = emailSchema.safeParse(testTo)
    if (!to.success) {
      toast.error('Enter a valid email address for the test.')
      return
    }
    setSendingTest(true)
    try {
      await call(api.email.sendTest({ to: to.data, subject, html, sample: imported?.valid[0] }))
      setSettings(await call(api.resend.getConfig()))
      toast.success(`Test email sent to ${to.data}. Check the inbox and spam folder.`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSendingTest(false)
    }
  }

  const start = async (): Promise<void> => {
    if (!imported) return
    setStarting(true)
    try {
      const summary = await call(
        api.campaign.start({ subject, html, recipients: imported.valid, sourceFile: imported.fileName })
      )
      setCurrent(await call(api.campaign.get(summary.id)))
      navigate('/send')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setStarting(false)
    }
  }

  return (
    <Page>
      <PageHeader title="Review & test" description="Check everything, send yourself a test, then start." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Recipients" value={nf.format(count)} hint={imported ? `${imported.invalid.length} invalid · ${imported.duplicates.length} duplicate skipped` : 'No file'} />
            <Stat label="Batches" value={nf.format(batches)} hint={`${batchSize} per batch · ${rps} req/s`} />
            <Stat label="Estimated time" value={count ? formatDuration(seconds) : '—'} hint="Longer if rate limited" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview (first recipient)</CardTitle>
            </CardHeader>
            <CardContent>
              <EmailPreview
                subject={subject}
                html={html}
                recipient={imported?.valid[0] ?? { name: '', email: 'recipient@example.com', fields: {} }}
                fallback={settings?.nameFallback ?? 'there'}
                from={settings?.fromEmail ? `${settings.fromName} <${settings.fromEmail}>` : undefined}
                height={360}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Send test to me</CardTitle>
              <CardDescription>Uses the first recipient's data. Subject gets a [TEST] prefix.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="testTo">Your email</Label>
              <Input id="testTo" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
            </CardContent>
            <CardFooter className="pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void sendTest()}
                disabled={sendingTest || !composeOk || !settings?.apiKeyMasked}
              >
                {sendingTest ? <Loader2 className="animate-spin" /> : <Send />}
                Send test email
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {checks.map((c) => (
                <Link key={c.label} to={c.to} className="flex items-center gap-2 hover:underline">
                  {c.ok ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
                  <span className={c.ok ? '' : 'text-muted-foreground'}>{c.label}</span>
                </Link>
              ))}
            </CardContent>
            <CardFooter className="pt-4">
              <Button className="w-full" size="lg" disabled={!ready || starting} onClick={() => setConfirmOpen(true)}>
                {starting ? <Loader2 className="animate-spin" /> : <Rocket />}
                Start sending
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Send to ${nf.format(count)} people?`}
        confirmLabel={`Send ${nf.format(count)} emails`}
        description={
          <div className="space-y-2">
            <p>
              From <strong>{settings?.fromName}</strong> &lt;{settings?.fromEmail}&gt;. You can pause or cancel while it runs, but sent
              emails cannot be recalled.
            </p>
            <p>Only send to people who agreed to receive email from you.</p>
          </div>
        }
        onConfirm={() => void start()}
      />
    </Page>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }): React.JSX.Element {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}
