import { useEffect } from 'react'
import { create } from 'zustand'

export type ThemeChoice = 'light' | 'dark' | 'system'
const KEY = 'bulk-mailer-theme'

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const media = window.matchMedia('(prefers-color-scheme: dark)')
const resolve = (c: ThemeChoice): 'light' | 'dark' => (c === 'system' ? (media.matches ? 'dark' : 'light') : c)

interface ThemeState {
  choice: ThemeChoice
  resolved: 'light' | 'dark'
  setChoice: (c: ThemeChoice) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  choice: readChoice(),
  resolved: resolve(readChoice()),
  setChoice: (choice) => {
    try {
      localStorage.setItem(KEY, choice)
    } catch {
      /* private storage unavailable: keep in memory only */
    }
    set({ choice, resolved: resolve(choice) })
  }
}))

export function useTheme(): ThemeState {
  return useThemeStore()
}

/** Mount once: keeps the <html class="dark"> in sync with the choice and OS. */
export function useApplyTheme(): void {
  const { choice, resolved } = useThemeStore()
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])
  useEffect(() => {
    const onChange = (): void => useThemeStore.setState({ resolved: resolve(choice) })
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [choice])
}
