import { create } from 'zustand'
import type { AuthStatus } from '@shared/types'
import { api, call } from '@/lib/api'

interface AuthStore {
  status: AuthStatus | null
  refresh: () => Promise<AuthStatus>
  set: (s: AuthStatus) => void
  logout: () => Promise<void>
  /** Marks the session as gone locally (auto-lock, UNAUTHORIZED). */
  expire: () => void
}

export const useAuth = create<AuthStore>((set, get) => ({
  status: null,
  refresh: async () => {
    const s = await call(api.auth.status())
    set({ status: s })
    return s
  },
  set: (status) => set({ status }),
  logout: async () => {
    set({ status: await call(api.auth.logout()) })
  },
  expire: () => {
    const s = get().status
    if (s && s.state === 'logged-in') set({ status: { ...s, state: 'logged-out' } })
  }
}))
