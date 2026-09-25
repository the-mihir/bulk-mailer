import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff, Loader2, PlugZap, Trash2, XCircle, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { changePasswordSchema, preferencesSchema, resendConfigSchema } from '@shared/schemas'
import type { ConnectionResult, ResendSettingsView } from '@shared/types'
import type { AppInfo } from '@shared/ipc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Credit } from '@/components/common/Credit'
import { PasswordInput } from '@/components/common/PasswordInput'
import { Page, PageHeader } from '@/components/layout/PageHeader'
import { api, call, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useAuth } from '@/store/auth'
import { useCampaign } from '@/store/campaign'

export default function SettingsPage(): React.JSX.Element {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'resend'
  return (
    <Page>
      <PageHeader title="Settings" description="Resend connection, account and app preferences." />
      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="resend">Resend</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>
        <TabsContent value="resend" className="mt-4">
          <ResendTab />
        </TabsContent>
        <TabsContent value="account" className="mt-4">
          <AccountTab />
        </TabsContent>
        <TabsContent value="preferences" className="mt-4">
          <PreferencesTab />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

type ResendForm = z.input<typeof resendConfigSchema>

function toForm(v: ResendSettingsView): ResendForm {
  return {
    apiKey: '',
    fromName: v.fromName,
    fromEmail: v.fromEmail,
    replyTo: v.replyTo,
    unsubscribeEmail: v.unsubscribeEmail,
    batchSize: v.batchSize,
    requestsPerSecond: v.requestsPerSecond,
    maxRetries: v.maxRetries,
    nameFallback: v.nameFallback
  }
}

function ResendTab(): React.JSX.Element {
  const navigate = useNavigate()
  const { settings, setSettings } = useCampaign()
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ConnectionResult | null>(null)

  const form = useForm<ResendForm, unknown, z.output<typeof resendConfigSchema>>({
    resolver: zodResolver(resendConfigSchema),
    defaultValues: settings ? toForm(settings) : undefined
  })

  useEffect(() => {
    call(api.resend.getConfig())
      .then((v) => {
        setSettings(v)
        form.reset(toForm(v))
      })
      .catch((e) => toast.error(errorMessage(e)))
  }, [form, setSettings])

  const onSubmit = form.handleSubmit(async (values) => {
    if (!values.apiKey && !settings?.apiKeyMasked) {
      form.setError('apiKey', { message: 'API key is required' })
      return
    }
    try {
      const v = await call(api.resend.saveConfig(values))
      setSettings(v)
      form.reset(toForm(v))
      setResult(null)
      toast.success('Settings saved')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })

  const test = async (): Promise<void> => {
    if (form.formState.isDirty) {
      toast.warning('Save your changes before testing.')
      return
    }
    setTesting(true)
    try {
      const r = await call(api.resend.testConnection())
      setResult(r)
      setSettings(await call(api.resend.getConfig()))
    } catch (err) {
      setResult({ status: 'error', message: errorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  const removeKey = async (): Promise<void> => {
    try {
      const v = await call(api.resend.removeKey())
      setSettings(v)
      setResult(null)
      toast.success('API key removed')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Resend connection</CardTitle>
          <CardDescription>
            The key is encrypted with your OS keychain and never shown again. Use a key with{' '}
            <strong>Sending access</strong> only.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-5">
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API key</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          type={showKey ? 'text' : 'password'}
                          placeholder={settings?.apiKeyMasked ?? 're_…'}
                          autoComplete="off"
                          spellCheck={false}
                          {...field}
                        />
                      </FormControl>
                      <Button type="button" variant="outline" size="icon" onClick={() => setShowKey((s) => !s)} aria-label="Show key">
                        {showKey ? <EyeOff /> : <Eye />}
                      </Button>
                      {settings?.apiKeyMasked ? (
                        <ConfirmDialog
                          trigger={
                            <Button type="button" variant="outline" size="icon" aria-label="Remove key">
                              <Trash2 />
                            </Button>
                          }
                          title="Remove the API key?"
                          description="Sending stops working until you add a key again."
                          confirmLabel="Remove key"
                          destructive
                          onConfirm={() => void removeKey()}
                        />
                      ) : null}
                    </div>
                    <FormDescription>
                      {settings?.apiKeyMasked
                        ? `Saved: ${settings.apiKeyMasked}. Leave empty to keep it.`
                        : 'Starts with re_. Create one at resend.com → API Keys.'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField form={form} name="fromName" label="From name" placeholder="Plexora Lab" />
                <TextField form={form} name="fromEmail" label="From email" placeholder="hello@mail.yourdomain.com" description="Domain must be verified in Resend." />
                <TextField form={form} name="replyTo" label="Reply-To (optional)" placeholder="support@yourdomain.com" />
                <TextField form={form} name="unsubscribeEmail" label="Unsubscribe mailbox (optional)" placeholder="unsubscribe@yourdomain.com" description="Adds a List-Unsubscribe header. Improves delivery." />
              </div>
              <div className="grid gap-5 sm:grid-cols-4">
                <NumberField form={form} name="batchSize" label="Batch size" description="1–100" />
                <NumberField form={form} name="requestsPerSecond" label="Requests / sec" description="1–5" />
                <NumberField form={form} name="maxRetries" label="Max retries" description="0–5" />
                <TextField form={form} name="nameFallback" label="Name fallback" description='When name is empty: "Hi there"' />
              </div>
            </CardContent>
            <CardFooter className="justify-between gap-2 pt-6">
              <Button type="button" variant="outline" onClick={() => void test()} disabled={testing || !settings?.apiKeyMasked}>
                {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
                Test connection
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Save
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {settings?.verified ? (
              <Badge variant="success">
                <CheckCircle2 /> Ready to send
              </Badge>
            ) : (
              <Badge variant="warning">
                <AlertTriangle /> Not verified
              </Badge>
            )}
            {result ? <ConnectionBadge result={result} /> : null}
            {settings?.verifiedAt ? (
              <p className="text-muted-foreground">Verified {formatDate(settings.verifiedAt)}</p>
            ) : (
              <p className="text-muted-foreground">Save, then run Test connection. Sending stays disabled until it passes.</p>
            )}
            {result?.status === 'restricted' ? (
              <Button size="sm" variant="secondary" onClick={() => navigate('/review')}>
                Send a test email
              </Button>
            ) : null}
            {result?.domains?.length ? (
              <div className="space-y-1 pt-2">
                <p className="font-medium">Domains in Resend</p>
                {result.domains.map((d) => (
                  <div key={d.name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{d.name}</span>
                    <Badge variant={d.status === 'verified' ? 'success' : 'secondary'}>{d.status}</Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Before your first send</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm text-muted-foreground">
            <p>• Verify a subdomain (e.g. mail.yourdomain.com) in Resend.</p>
            <p>• Add SPF and DKIM records, plus DMARC (p=none to start).</p>
            <p>• New domain: warm up with small batches for a few days.</p>
            <p>• Only email people who agreed to hear from you.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ConnectionBadge({ result }: { result: ConnectionResult }): React.JSX.Element {
  if (result.status === 'ok')
    return (
      <div className="flex items-start gap-2 text-success">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {result.message}
      </div>
    )
  if (result.status === 'restricted')
    return (
      <div className="flex items-start gap-2 text-warning">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {result.message}
      </div>
    )
  return (
    <div className="flex items-start gap-2 text-destructive">
      <XCircle className="mt-0.5 size-4 shrink-0" /> {result.message}
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function TextField({
  form,
  name,
  label,
  placeholder,
  description
}: {
  form: any
  name: string
  label: string
  placeholder?: string
  description?: string
}): React.JSX.Element {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input placeholder={placeholder} spellCheck={false} {...field} value={field.value ?? ''} />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function NumberField({
  form,
  name,
  label,
  description
}: {
  form: any
  name: string
  label: string
  description?: string
}): React.JSX.Element {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type="number" inputMode="numeric" {...field} value={field.value ?? ''} />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function AccountTab(): React.JSX.Element {
  const navigate = useNavigate()
  const username = useAuth((s) => s.status?.username)
  const form = useForm<z.input<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await call(api.auth.changePassword(values))
      form.reset()
      toast.success('Password changed')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })

  const resetApp = async (): Promise<void> => {
    try {
      useAuth.getState().set(await call(api.auth.resetApp()))
      useCampaign.getState().reset()
      toast.success('App reset')
      navigate('/login')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Signed in as {username}.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {name === 'currentPassword' ? 'Current password' : name === 'newPassword' ? 'New password' : 'Confirm new password'}
                      </FormLabel>
                      <FormControl>
                        <PasswordInput autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </CardContent>
            <CardFooter className="pt-6">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Update password
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Reset app</CardTitle>
          <CardDescription>
            Erase the account, the saved API key, all settings and campaign history. The app returns to first-run setup.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <ConfirmDialog
            trigger={<Button variant="destructive">Reset app…</Button>}
            title="Erase everything?"
            description="Account, API key, settings and history are deleted. A running campaign stops. This cannot be undone."
            confirmLabel="Erase everything"
            destructive
            onConfirm={() => void resetApp()}
          />
        </CardFooter>
      </Card>
    </div>
  )
}

function PreferencesTab(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const form = useForm<z.input<typeof preferencesSchema>, unknown, z.output<typeof preferencesSchema>>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: { autoLockMinutes: 15 }
  })

  useEffect(() => {
    call(api.settings.get()).then((p) => form.reset(p)).catch(() => {})
    call(api.app.info()).then(setInfo).catch(() => {})
  }, [form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      form.reset(await call(api.settings.save(values)))
      toast.success('Preferences saved')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={onSubmit}>
            <CardContent>
              <FormField
                control={form.control}
                name="autoLockMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Auto-lock after (minutes)</FormLabel>
                    <FormControl>
                      <Input type="number" className="w-32" {...field} value={String(field.value ?? '')} />
                    </FormControl>
                    <FormDescription>Idle time before the app locks. A running campaign keeps sending.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="pt-6">
              <Button type="submit" disabled={!form.formState.isDirty}>
                Save
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            Version <span className="font-mono">{info?.version}</span> · {info?.platform}/{info?.arch}
          </p>
          <p className="break-all text-muted-foreground">
            Data folder: <span className="font-mono">{info?.dataPath}</span>
          </p>
          <Credit className="pt-2 text-sm" />
        </CardContent>
      </Card>
    </div>
  )
}
