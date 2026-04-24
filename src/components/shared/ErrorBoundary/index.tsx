// 全局错误边界 - 捕获子组件渲染异常，防止白屏崩溃
import { Component, type ReactNode, type ErrorInfo } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 渲染异常:', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
            <svg className="size-7 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">页面出现了问题</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            应用遇到了一个意外错误。你可以尝试重新加载，如果问题持续，请重启应用。
          </p>
          <pre className="max-h-32 max-w-md overflow-auto rounded-lg bg-muted/50 p-3 text-left text-xs text-muted-foreground">
            {this.state.error?.message ?? '未知错误'}
          </pre>
          <Button onClick={this.handleReload}>重新加载</Button>
        </div>
      )
    }
    return this.props.children
  }
}
