/**
 * 文件类型图标 - 根据文件路径后缀自动匹配对应图标
 */
import SvgIcon from '@/components/shared/SvgIcon'
import { getFileIconName } from '@/lib/file-icons'
import { cn } from '@/lib/utils'

interface Props {
  paths?: string[]
  className?: string
  title?: string
}

export default function FileTypeIcon({ paths, className, title }: Props) {
  return (
    <SvgIcon
      name={getFileIconName(paths)}
      className={cn('text-foreground/85', className)}
      title={title}
    />
  )
}
