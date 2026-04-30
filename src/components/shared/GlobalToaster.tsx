/**
 * 全局 Toaster 默认配置：所有窗口的顶部居中、3.2 s 时长、统一字号。
 * 把分散在 7 个入口的样板汇总到此处，避免参数漂移。
 */
import { Toaster } from 'react-hot-toast'

export default function GlobalToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{ duration: 3200, className: 'text-sm' }}
    />
  )
}
