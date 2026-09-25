import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/store/auth'

/** UI guard only. The real guard is requireAuth() on every IPC handler in main. */
export function ProtectedRoute({ children }: { children: React.ReactNode }): React.JSX.Element {
  const status = useAuth((s) => s.status)
  const location = useLocation()
  if (status?.state !== 'logged-in') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}
