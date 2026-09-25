import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { useApplyTheme } from '@/hooks/use-theme'
import { api, call, setUnauthorizedHandler } from '@/lib/api'
import { useAuth } from '@/store/auth'
import { useCampaign } from '@/store/campaign'
import LoginPage from '@/pages/Login'
import SettingsPage from '@/pages/Settings'
import ImportPage from '@/pages/Import'
import ComposePage from '@/pages/Compose'
import ReviewPage from '@/pages/Review'
import SendPage from '@/pages/Send'
import ReportPage from '@/pages/Report'
import HistoryPage from '@/pages/History'

const ACTIVITY_PING_MS = 30_000

/** Start page: Settings until Resend is verified, otherwise Import. */
function HomeRedirect(): React.JSX.Element {
  const [to, setTo] = useState<string | null>(null)
  useEffect(() => {
    call(api.resend.getConfig())
      .then((s) => setTo(s.verified ? '/import' : '/settings'))
      .catch(() => setTo('/settings'))
  }, [])
  return to ? <Navigate to={to} replace /> : <></>
}

export default function App(): React.JSX.Element {
  useApplyTheme()
  const status = useAuth((s) => s.status)
  const navigate = useNavigate()
  const lastPing = useRef(0)

  useEffect(() => {
    void useAuth.getState().refresh()
    setUnauthorizedHandler(() => useAuth.getState().expire())
    const offLock = api.auth.onLocked(() => {
      useAuth.getState().expire()
      toast.info('Locked after inactivity. Any running campaign keeps sending.')
      navigate('/login')
    })
    const offProgress = api.campaign.onProgress((p) => useCampaign.getState().applyProgress(p))
    return () => {
      offLock()
      offProgress()
    }
  }, [navigate])

  // Tell main about user activity (throttled) so the idle auto-lock timer restarts.
  useEffect(() => {
    if (status?.state !== 'logged-in') return
    const ping = (): void => {
      const now = Date.now()
      if (now - lastPing.current < ACTIVITY_PING_MS) return
      lastPing.current = now
      api.auth.activity()
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, ping, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, ping))
  }, [status?.state])

  if (!status) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/compose" element={<ComposePage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/send" element={<SendPage />} />
        <Route path="/report/:id?" element={<ReportPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
