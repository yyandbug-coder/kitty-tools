/**
 * 应用错误边界 - 捕获渲染过程中的异常并展示错误提示界面
 * 提供重新加载按钮以便用户恢复应用
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@clipboard/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App render error:', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  override render() {
    const { error } = this.state
    if (error) {
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-center text-zinc-100">
          <p className="text-sm font-medium">界面渲染出错</p>
          <p className="max-w-md text-xs text-zinc-400">
            {error.message || String(error)}
          </p>
          <p className="max-w-md text-xs text-zinc-500">
            可尝试点击下方按钮重新加载，恢复应用界面。
          </p>
          <Button type="button" variant="default" onClick={this.handleReload}>
            重新加载
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
