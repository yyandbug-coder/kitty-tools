/**
 * SVG 图标组件 - 通过 sprite symbol 引用渲染 SVG 图标
 * 支持自定义类名、标题和所有原生 SVG 属性
 */
import type { SVGProps } from 'react'
import { cn } from '@clipboard/lib/utils'

interface Props extends SVGProps<SVGSVGElement> {
  name: string
  title?: string
}

export default function SvgIcon({ name, className, title, ...props }: Props) {
  const symbolId = `#icon-${name}`

  return (
    <svg
      className={cn('shrink-0 fill-current', className)}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <use href={symbolId} />
    </svg>
  )
}
