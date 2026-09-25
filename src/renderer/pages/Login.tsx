import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, Lock, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { loginSchema, setupSchema } from '@shared/schemas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Credit } from '@/components/common/Credit'
import { PasswordInput } from '@/components/common/PasswordInput'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { api, call, errorMessage } from '@/lib/api'
import { useAuth } from '@/store/auth'
import { useCampaign } from '@/store/campaign'

export default function LoginPage(): React.JSX.Element {
  const status = useAuth((s) => s.status)
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (status?.state === 'logged-in') return <Navigate to={from} replace />

  return (
    <div className="relative flex min-h-full items-center justify-center bg-muted/40 p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Mail className="size-5" />
          </div>
          <h1 className="text-xl font-semibold">Bulk Mailer</h1>
        </div>
        {status?.state === 'no-account' ? <SetupForm /> : <LoginForm lockedUntil={status?.lockedUntil ?? null} />}
        <div className="space-y-1 text-center">
          <p className="text-xs text-muted-foreground">Everything stays on this computer.</p>
          <Credit />
        </div>
      </div>
    </div>
  )
}

function SetupForm(): React.JSX.Element {
  const form = useForm<z.input<typeof setupSchema>>({
    resolver: zodResolver(setupSchema),
    defaultValues: { username: '', password: '', confirmPassword: '' }
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      useAuth.getState().set(await call(api.auth.setup(values)))
      toast.success('Account created. Now connect Resend.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>First run. This account protects your API key and send history.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input autoFocus autoComplete="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormDescription>At least 8 characters.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="pt-6">
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Create account
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}

function useCountdown(until: number | null): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!until || until <= Date.now()) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until])
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
}

function LoginForm({ lockedUntil: initialLock }: { lockedUntil: number | null }): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [lockedUntil, setLockedUntil] = useState(initialLock)
  const secondsLeft = useCountdown(lockedUntil)
  const [resetOpen, setResetOpen] = useState(false)

  const form = useForm<z.input<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: useAuth.getState().status?.username ?? '', password: '' }
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      useAuth.getState().set(await call(api.auth.login(values)))
      navigate(from, { replace: true })
    } catch (err) {
      form.setValue('password', '')
      toast.error(errorMessage(err))
      const s = await useAuth.getState().refresh()
      setLockedUntil(s.lockedUntil)
    }
  })

  const resetApp = async (): Promise<void> => {
    try {
      useAuth.getState().set(await call(api.auth.resetApp()))
      useCampaign.getState().reset()
      toast.success('App reset. Create a new account.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const locked = secondsLeft > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Enter your local account password.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {locked ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <Lock className="size-4" />
                Too many attempts. Try again in {Math.floor(secondsLeft / 60)}:
                {String(secondsLeft % 60).padStart(2, '0')}.
              </div>
            ) : null}
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input autoComplete="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordInput autoFocus autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex-col gap-3 pt-6">
            <Button type="submit" className="w-full" disabled={locked || form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Log in
            </Button>
            <Button type="button" variant="link" size="sm" className="text-muted-foreground" onClick={() => setResetOpen(true)}>
              Forgot password?
            </Button>
          </CardFooter>
        </form>
      </Form>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset the app?"
        destructive
        confirmLabel="Erase everything"
        description={
          <div className="space-y-2">
            <p>There is no password recovery. Reset erases:</p>
            <ul className="list-disc pl-5">
              <li>your account</li>
              <li>the saved Resend API key and settings</li>
              <li>all campaign history</li>
            </ul>
            <p>You then create a new account. This cannot be undone.</p>
          </div>
        }
        onConfirm={() => void resetApp()}
      />
    </Card>
  )
}
