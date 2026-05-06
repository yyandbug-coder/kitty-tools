/**
 * 订阅 Tauri 事件的薄封装：处理 `listen()` 返回 Promise 的「卸载竞态」与组件 unmount 清理，
 * 避免在每个 effect 里重复写 `cancelled` flag + `unlisten` ref + cleanup 模板。
 *
 * 用法：
 * ```tsx
 * useTauriEvent<MyPayload>('my-event', (e) => {
 *   doSomething(e.payload)
 * }, [dep])
 * ```
 *
 * 第三个参数 `deps` 与 useEffect 一致；handler 通过 ref 转发，仅在 `eventName` 或
 * 依赖变化时重新订阅。这样调用方传内联箭头函数也不会触发反复 listen/unlisten。
 */
import { useEffect, useRef } from 'react'
import { listen, type Event, type EventName } from '@tauri-apps/api/event'

export function useTauriEvent<P>(
  eventName: EventName,
  handler: (event: Event<P>) => void,
  deps: ReadonlyArray<unknown> = []
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void listen<P>(eventName, (event) => {
      handlerRef.current(event)
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
    // eventName + 调用方依赖共同决定是否重订阅；handler 通过 ref 始终用最新版本。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, ...deps])
}
