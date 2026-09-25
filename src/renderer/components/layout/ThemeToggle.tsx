import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme, type ThemeChoice } from '@/hooks/use-theme'

const NEXT: Record<ThemeChoice, ThemeChoice> = { light: 'dark', dark: 'system', system: 'light' }
const ICON = { light: Sun, dark: Moon, system: Monitor }

export function ThemeToggle(): React.JSX.Element {
  const { choice, setChoice } = useTheme()
  const Icon = ICON[choice]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={() => setChoice(NEXT[choice])} aria-label="Toggle theme">
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Theme: {choice}</TooltipContent>
    </Tooltip>
  )
}
