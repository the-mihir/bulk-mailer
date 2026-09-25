import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronsUpDown,
  FileSpreadsheet,
  History,
  KeyRound,
  LogOut,
  Mail,
  PenLine,
  Send,
  Settings,
  ShieldCheck,
  FileBarChart
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Credit } from '@/components/common/Credit'
import { api, call } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { useCampaign } from '@/store/campaign'
import { ThemeToggle } from './ThemeToggle'

interface Step {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  done?: boolean
}

export function AppShell(): React.JSX.Element {
  const navigate = useNavigate()
  const username = useAuth((s) => s.status?.username)
  const { settings, imported, subject, html, current, setSettings } = useCampaign()

  useEffect(() => {
    call(api.resend.getConfig()).then(setSettings).catch(() => {})
  }, [setSettings])

  const sending = current?.status === 'running' || current?.status === 'paused'
  const steps: Step[] = [
    { to: '/settings', label: 'Settings', icon: Settings, done: settings?.verified },
    { to: '/import', label: 'Import', icon: FileSpreadsheet, done: (imported?.valid.length ?? 0) > 0 },
    { to: '/compose', label: 'Compose', icon: PenLine, done: !!subject.trim() && !!html.trim() },
    { to: '/review', label: 'Review & Test', icon: ShieldCheck },
    { to: '/send', label: 'Send', icon: Send, done: current?.status === 'completed' },
    { to: `/report${current ? `/${current.id}` : ''}`, label: 'Report', icon: FileBarChart }
  ]

  const logout = async (): Promise<void> => {
    await useAuth.getState().logout()
    navigate('/login')
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Mail className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Bulk Mailer</div>
            <div className="text-xs text-muted-foreground">Resend</div>
          </div>
        </div>
        <Separator />
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {steps.map((s, i) => (
            <NavItem key={s.label} step={s} index={i + 1} live={s.label === 'Send' && sending} />
          ))}
          <Separator className="my-2" />
          <NavItem step={{ to: '/history', label: 'History', icon: History }} />
        </nav>
        <Separator />
        <div className="flex items-center gap-1 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex-1 justify-between px-2">
                <span className="truncate">{username}</span>
                <ChevronsUpDown className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-52">
              <DropdownMenuLabel>Signed in as {username}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate('/settings?tab=account')}>
                <KeyRound /> Change password
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void logout()}>
                <LogOut /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
        </div>
        <Credit className="px-4 pb-3" />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

function NavItem({ step, index, live }: { step: Step; index?: number; live?: boolean }): React.JSX.Element {
  const Icon = step.icon
  return (
    <NavLink
      to={step.to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
        )
      }
    >
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex-1">
        {index ? <span className="mr-1 text-muted-foreground">{index}.</span> : null}
        {step.label}
      </span>
      {live ? <span className="size-2 animate-pulse rounded-full bg-success" /> : null}
      {step.done && !live ? <CheckCircle2 className="size-4 text-success" /> : null}
    </NavLink>
  )
}
