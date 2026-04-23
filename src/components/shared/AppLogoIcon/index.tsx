// 应用 Logo 图标组件 - 渲染 Kitty Tools 应用图标
import type { ImgHTMLAttributes } from 'react'
import appLogo from '@/assets/images/logo.png'
import { cn } from '@/lib/utils'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>

export default function AppLogoIcon({ alt = 'Kitty Logo', className, draggable = false, ...props }: Props) {
  return (
    <img
      src={appLogo}
      alt={alt}
      draggable={draggable}
      className={cn('shrink-0 select-none object-contain', className)}
      {...props}
    />
  )
}
