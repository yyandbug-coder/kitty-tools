import { useCallback, useEffect, useRef, useState } from 'react'
import { emit, listen } from '@tauri-apps/api/event'

type PersistedSyncStateOptions<T> = {
  initialState: T
  syncEvent: string
  loadState: () => Promise<T>
  persistState: (state: T) => Promise<void>
  serializeState: (state: T) => string
  saveDelayMs?: number
  mergeLoadedState?: (loadedState: T, currentState: T) => T
  prepareStateForPersist?: (state: T, context: {
    currentState: T
    lastPersistedSerialized: string
  }) => Promise<T>
  onLoadError?: (error: unknown) => void
  onSyncError?: (error: unknown) => void
  onPersistError?: (error: unknown) => void
  onPersisted?: (persistedState: T, snapshotState: T, context: {
    currentState: T
  }) => void
  autoPersist?: boolean
}

export function usePersistedSyncState<T>({
  initialState,
  syncEvent,
  loadState,
  persistState,
  serializeState,
  saveDelayMs = 150,
  mergeLoadedState,
  prepareStateForPersist,
  onLoadError,
  onSyncError,
  onPersistError,
  onPersisted,
  autoPersist = true,
}: PersistedSyncStateOptions<T>) {
  const [state, setState] = useState<T>(initialState)
  const [loaded, setLoaded] = useState(false)
  const stateRef = useRef<T>(initialState)
  const isLoadingRef = useRef(true)
  const lastPersistedSerializedRef = useRef('')

  const replaceState = useCallback((nextState: T) => {
    stateRef.current = nextState
    setState(nextState)
  }, [])

  const updateState = useCallback((updater: (prev: T) => T) => {
    setState((prev) => {
      const next = updater(prev)
      stateRef.current = next
      return next
    })
  }, [])

  const applyLoadedState = useCallback((loadedState: T) => {
    const nextState = mergeLoadedState
      ? mergeLoadedState(loadedState, stateRef.current)
      : loadedState
    lastPersistedSerializedRef.current = serializeState(loadedState)
    replaceState(nextState)
  }, [mergeLoadedState, replaceState, serializeState])

  const persistNow = useCallback(async (stateToPersist: T, snapshotState: T = stateToPersist) => {
    const serialized = serializeState(stateToPersist)
    if (serialized === lastPersistedSerializedRef.current) {
      onPersisted?.(stateToPersist, snapshotState, { currentState: stateRef.current })
      return stateToPersist
    }

    await persistState(stateToPersist)
    lastPersistedSerializedRef.current = serialized
    if (stateRef.current !== stateToPersist) {
      replaceState(stateToPersist)
    }
    onPersisted?.(stateToPersist, snapshotState, { currentState: stateRef.current })
    await emit(syncEvent, {})
    return stateToPersist
  }, [onPersisted, persistState, replaceState, serializeState, syncEvent])

  useEffect(() => {
    let cancelled = false

    void loadState()
      .then((loadedState) => {
        if (!cancelled) {
          applyLoadedState(loadedState)
        }
      })
      .catch((error) => {
        onLoadError?.(error)
      })
      .finally(() => {
        if (!cancelled) {
          isLoadingRef.current = false
          setLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [applyLoadedState, loadState, onLoadError])

  useEffect(() => {
    let unlisten: (() => void) | undefined

    void listen(syncEvent, async () => {
      try {
        const loadedState = await loadState()
        const serialized = serializeState(loadedState)
        if (serialized === lastPersistedSerializedRef.current) {
          return
        }
        applyLoadedState(loadedState)
      } catch (error) {
        onSyncError?.(error)
      }
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [applyLoadedState, loadState, onSyncError, serializeState, syncEvent])

  useEffect(() => {
    if (!autoPersist) {
      return
    }

    if (isLoadingRef.current) {
      return
    }

    const stateSnapshot = state

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const stateToPersist = prepareStateForPersist
            ? await prepareStateForPersist(stateSnapshot, {
                currentState: stateRef.current,
                lastPersistedSerialized: lastPersistedSerializedRef.current,
              })
            : stateSnapshot

          await persistNow(stateToPersist, stateSnapshot)
        } catch (error) {
          onPersistError?.(error)
        }
      })()
    }, saveDelayMs)

    return () => window.clearTimeout(timeout)
  }, [
    onPersistError,
    onPersisted,
    persistState,
    prepareStateForPersist,
    persistNow,
    saveDelayMs,
    state,
  ])

  return {
    state,
    loaded,
    applyLoadedState,
    persistNow,
    replaceState,
    updateState,
    stateRef,
    isLoadingRef,
    lastPersistedSerializedRef,
  }
}
