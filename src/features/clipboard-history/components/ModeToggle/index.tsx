/**
 * 外观模式切换 - shadcn 文档式下拉：浅色 / 深色 / 跟随系统（写入应用设置）
 */
import { Moon, Sun } from 'lucide-react'
import { Button } from '@clipboard/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@clipboard/components/ui/dropdown-menu'
import { useTheme } from '@clipboard/components/ThemeProvider'

export default function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="default" size="icon" className="relative shrink-0" aria-label="切换显示模式">
          <Sun className="size-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">切换显示模式</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>浅色</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>深色</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>跟随系统</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
