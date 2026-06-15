/**
 * JSON 编辑器面板：工具栏（新建/打开/保存/格式化/压缩/模式切换）、编辑区（单栏或分屏预览）、状态栏。
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import toast from 'react-hot-toast'
import {
  AlignLeft,
  Braces,
  ClipboardPaste,
  Clock,
  Columns2,
  Copy,
  FileDown,
  FilePlus2,
  FolderOpen,
  Loader2,
  Minimize2,
  Save,
} from 'lucide-react'
import { Mode, type Content, type ContentErrors } from 'vanilla-jsoneditor'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { copyTextWithFallback } from '@/lib/copy-text'
import {
  basenameFromPath,
  beautifyContent,
  compactContent,
  compactJsonText,
  contentToFileText,
  createDefaultJsonContent,
  getJsonContentErrorMessage,
  isBlankJsonContent,
  isJsonContentValid,
  isLikelyJsonFilePath,
  textToEditorContent,
} from '@/lib/json-editor'
import { loadJsonEditorPrefs, pushJsonEditorRecentFile, saveJsonEditorPrefs } from '@/lib/json-editor-prefs'
import { isMacOs } from '@/lib/platform'
import { readTextFromClipboard } from '@/lib/read-text'
import {
  JSON_EDITOR_SPLIT_DEFAULT_RATIO,
  JSON_EDITOR_DEFAULT_VIEW_MODE,
  type JsonEditorUnsavedAction,
  type JsonEditorViewMode,
} from '@/types/json-editor'
import JsonEditorSplitView from '@/components/json-editor/JsonEditorSplitView'
import LazyVanillaJsonEditor from '@/components/json-editor/lazyVanillaJsonEditor'

const DIRTY_CHECK_DELAY_MS = 200

function viewModeToEditorMode(mode: JsonEditorViewMode): Mode {
  return mode === 'text' ? Mode.text : Mode.tree
}

function editorModeToViewMode(mode: Mode): JsonEditorViewMode {
  return mode === Mode.text ? 'text' : 'tree'
}

function getUnsavedDialogCopy(action: JsonEditorUnsavedAction | null): {
  title: string
  description: string
  saveLabel: string
} {
  if (!action) {
    return { title: '未保存的更改', description: '', saveLabel: '保存并继续' }
  }
  switch (action.type) {
    case 'close':
      return {
        title: '未保存的更改',
        description: '当前文档有未保存的修改，关闭前是否保存？',
        saveLabel: '保存并关闭',
      }
    case 'new':
      return {
        title: '未保存的更改',
        description: '新建将丢弃当前未保存的修改，是否先保存？',
        saveLabel: '保存并新建',
      }
    case 'open':
      return {
        title: '未保存的更改',
        description: '打开其他文件将丢弃当前未保存的修改，是否先保存？',
        saveLabel: '保存并打开',
      }
    case 'openPath':
      return {
        title: '未保存的更改',
        description: `打开「${basenameFromPath(action.path)}」将丢弃当前未保存的修改，是否先保存？`,
        saveLabel: '保存并打开',
      }
    case 'importText':
      return {
        title: '未保存的更改',
        description: '导入剪贴板内容将丢弃当前未保存的修改，是否先保存？',
        saveLabel: '保存并导入',
      }
    default:
      return {
        title: '未保存的更改',
        description: '当前文档有未保存的修改，是否先保存？',
        saveLabel: '保存并继续',
      }
  }
}

export default function JsonEditorPanel({ isDarkMode }: { isDarkMode: boolean }) {
  const defaultContent = useMemo(() => createDefaultJsonContent(), [])
  const [content, setContent] = useState<Content>(() => defaultContent)
  const [editorSession, setEditorSession] = useState(0)
  const [viewMode, setViewMode] = useState<JsonEditorViewMode>(JSON_EDITOR_DEFAULT_VIEW_MODE)
  const [splitRatio, setSplitRatio] = useState(JSON_EDITOR_SPLIT_DEFAULT_RATIO)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [filePath, setFilePath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [contentErrors, setContentErrors] = useState<ContentErrors | undefined>(undefined)
  const [unsavedPrompt, setUnsavedPrompt] = useState<JsonEditorUnsavedAction | null>(null)
  const [saving, setSaving] = useState(false)
  const [fileDragActive, setFileDragActive] = useState(false)
  const baselineRef = useRef<string>(contentToFileText(defaultContent, 2) ?? '')
  const dirtyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefsLoadedRef = useRef(false)

  const isValid = isJsonContentValid(contentErrors)
  const errorMessage = getJsonContentErrorMessage(contentErrors)
  const displayName = filePath ? basenameFromPath(filePath) : '未命名.json'
  const modKeyLabel = isMacOs() ? '⌘' : 'Ctrl'
  const unsavedDialog = getUnsavedDialogCopy(unsavedPrompt)

  const markBaseline = useCallback((nextContent: Content) => {
    baselineRef.current = contentToFileText(nextContent, 2) ?? ''
    setDirty(false)
  }, [])

  const scheduleDirtyCheck = useCallback((next: Content) => {
    if (dirtyTimerRef.current) {
      clearTimeout(dirtyTimerRef.current)
    }
    dirtyTimerRef.current = setTimeout(() => {
      const serialized = contentToFileText(next, 2) ?? ''
      if (serialized === baselineRef.current) {
        setDirty(false)
      }
    }, DIRTY_CHECK_DELAY_MS)
  }, [])

  const handleChange = useCallback(
    (next: Content, _prev: Content, status: { contentErrors: ContentErrors | undefined }) => {
      setContent(next)
      setContentErrors(status.contentErrors)
      setDirty(true)
      scheduleDirtyCheck(next)
    },
    [scheduleDirtyCheck]
  )

  const applyNewDocument = useCallback(() => {
    const next = createDefaultJsonContent()
    setContent(next)
    setContentErrors(undefined)
    setFilePath(null)
    markBaseline(next)
    setViewMode('tree')
    setEditorSession((n) => n + 1)
  }, [markBaseline])

  const loadFileFromPath = useCallback(
    async (targetPath: string) => {
      if (!isLikelyJsonFilePath(targetPath)) {
        toast.error('请拖入 JSON 文件（.json / .jsonc / .json5）')
        return
      }
      try {
        const text = await readTextFile(targetPath)
        const next = textToEditorContent(text)
        setContent(next)
        setContentErrors(undefined)
        setFilePath(targetPath)
        markBaseline(next)
        setRecentFiles((prev) => pushJsonEditorRecentFile(prev, targetPath))
        setEditorSession((n) => n + 1)
        toast.success(`已打开 ${basenameFromPath(targetPath)}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '打开文件失败')
      }
    },
    [markBaseline]
  )

  const openFileDialog = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json', 'jsonc', 'json5'] }],
      })
      if (!selected || typeof selected !== 'string') return
      await loadFileFromPath(selected)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '打开文件失败')
    }
  }, [loadFileFromPath])

  const applyImportedText = useCallback(
    (text: string) => {
      const next = textToEditorContent(text)
      setContent(next)
      setContentErrors(undefined)
      setFilePath(null)
      markBaseline(next)
      setEditorSession((n) => n + 1)
      toast.success('已从剪贴板导入')
    },
    [markBaseline]
  )

  const executeAction = useCallback(
    async (action: JsonEditorUnsavedAction) => {
      switch (action.type) {
        case 'close':
          await getCurrentWindow().hide()
          break
        case 'new':
          applyNewDocument()
          break
        case 'open':
          await openFileDialog()
          break
        case 'openPath':
          await loadFileFromPath(action.path)
          break
        case 'importText':
          applyImportedText(action.text)
          break
      }
    },
    [applyImportedText, applyNewDocument, loadFileFromPath, openFileDialog]
  )

  const requestAction = useCallback(
    (action: JsonEditorUnsavedAction) => {
      if (dirty) {
        setUnsavedPrompt(action)
        return
      }
      void executeAction(action)
    },
    [dirty, executeAction]
  )

  const persistToPath = useCallback(
    async (targetPath: string) => {
      const text = contentToFileText(content, 2)
      if (text === null) {
        toast.error('无法序列化当前内容')
        return false
      }
      if (!isValid) {
        toast.error('JSON 无效，请先修正后再保存')
        return false
      }

      setSaving(true)
      try {
        await writeTextFile(targetPath, text)
        setFilePath(targetPath)
        markBaseline(content)
        setRecentFiles((prev) => pushJsonEditorRecentFile(prev, targetPath))
        toast.success('保存成功')
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '保存失败')
        return false
      } finally {
        setSaving(false)
      }
    },
    [content, isValid, markBaseline]
  )

  const handleSaveAs = useCallback(async (): Promise<boolean> => {
    try {
      const target = await save({
        filters: [{ name: 'JSON', extensions: ['json'] }],
        defaultPath: filePath ?? 'untitled.json',
      })
      if (!target) return false
      return persistToPath(target)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '另存为失败')
      return false
    }
  }, [filePath, persistToPath])

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (filePath) {
      return persistToPath(filePath)
    }
    return handleSaveAs()
  }, [filePath, persistToPath, handleSaveAs])

  const handleBeautify = useCallback(() => {
    const next = beautifyContent(content)
    if (!next) {
      toast.error('当前内容不是合法 JSON，无法格式化')
      return
    }
    setContent(next)
    const serialized = contentToFileText(next, 2) ?? ''
    setDirty(serialized !== baselineRef.current)
    toast.success('已格式化')
  }, [content])

  const handleCompact = useCallback(() => {
    const next = compactContent(content)
    if (!next) {
      toast.error('当前内容不是合法 JSON，无法压缩')
      return
    }
    setContent(next)
    const serialized = contentToFileText(next, 2) ?? ''
    setDirty(serialized !== baselineRef.current)
    toast.success('已压缩')
  }, [content])

  const handleCopyFormatted = useCallback(async () => {
    const text = contentToFileText(content, 2)
    if (text === null || !isValid) {
      toast.error('JSON 无效，无法复制')
      return
    }
    try {
      await copyTextWithFallback(text)
      toast.success('已复制格式化 JSON')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '复制失败')
    }
  }, [content, isValid])

  const handleCopyCompact = useCallback(async () => {
    const raw = contentToFileText(content, 0)
    if (raw === null || !isValid) {
      toast.error('JSON 无效，无法复制')
      return
    }
    try {
      const compact = compactJsonText(raw)
      await copyTextWithFallback(compact)
      toast.success('已复制压缩 JSON')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '复制失败')
    }
  }, [content, isValid])

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await readTextFromClipboard()
      if (!text.trim()) {
        toast.error('剪贴板为空或非文本内容')
        return
      }
      requestAction({ type: 'importText', text })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '读取剪贴板失败')
    }
  }, [requestAction])

  const handleEditorError = useCallback((err: unknown) => {
    toast.error(err instanceof Error ? err.message : String(err))
  }, [])

  const handleEditorModeChange = useCallback((mode: Mode) => {
    setViewMode(editorModeToViewMode(mode))
  }, [])

  const handleUnsavedDiscard = useCallback(() => {
    const action = unsavedPrompt
    setUnsavedPrompt(null)
    if (action) {
      void executeAction(action)
    }
  }, [executeAction, unsavedPrompt])

  const handleUnsavedSaveAndContinue = useCallback(async () => {
    const action = unsavedPrompt
    if (!action) return
    const ok = await handleSave()
    if (!ok) return
    setUnsavedPrompt(null)
    await executeAction(action)
  }, [executeAction, handleSave, unsavedPrompt])

  useEffect(() => {
    void loadJsonEditorPrefs()
      .then((prefs) => {
        setViewMode(prefs.viewMode)
        setSplitRatio(prefs.splitRatio)
        setRecentFiles(prefs.recentFiles)
      })
      .finally(() => {
        prefsLoadedRef.current = true
      })
  }, [])

  useEffect(() => {
    if (!prefsLoadedRef.current) return
    void saveJsonEditorPrefs({ viewMode, splitRatio, recentFiles })
  }, [viewMode, splitRatio, recentFiles])

  useEffect(() => {
    let unlistenFocus: (() => void) | undefined
    let unlistenClose: (() => void) | undefined

    void listen('focus-json-editor-panel', () => {
      if (filePath) return
      setContent((prev) => {
        if (!isBlankJsonContent(prev)) return prev
        setEditorSession((n) => n + 1)
        return createDefaultJsonContent()
      })
    }).then((fn) => {
      unlistenFocus = fn
    })

    void listen('json-editor-close-requested', () => {
      requestAction({ type: 'close' })
    }).then((fn) => {
      unlistenClose = fn
    })

    return () => {
      unlistenFocus?.()
      unlistenClose?.()
    }
  }, [filePath, requestAction])

  useEffect(() => {
    let unlistenDrag: (() => void) | undefined

    void getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          setFileDragActive(true)
          return
        }
        if (event.payload.type === 'drop') {
          setFileDragActive(false)
          const path =
            event.payload.paths.find((item) => isLikelyJsonFilePath(item)) ?? event.payload.paths[0]
          if (path) {
            requestAction({ type: 'openPath', path })
          }
          return
        }
        setFileDragActive(false)
      })
      .then((fn) => {
        unlistenDrag = fn
      })

    return () => {
      unlistenDrag?.()
    }
  }, [requestAction])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return

      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        void handleSave()
      } else if (key === 'o') {
        e.preventDefault()
        requestAction({ type: 'open' })
      } else if (key === 'n') {
        e.preventDefault()
        requestAction({ type: 'new' })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave, requestAction])

  useEffect(() => {
    return () => {
      if (dirtyTimerRef.current) {
        clearTimeout(dirtyTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => requestAction({ type: 'new' })}
            title={`新建 (${modKeyLabel}+N)`}
          >
            <FilePlus2 className="size-4" />
            <span className="hidden sm:inline">新建</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => requestAction({ type: 'open' })}
            title={`打开 (${modKeyLabel}+O)`}
          >
            <FolderOpen className="size-4" />
            <span className="hidden sm:inline">打开</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={recentFiles.length === 0}
                title="最近打开"
              >
                <Clock className="size-4" />
                <span className="hidden sm:inline">最近</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-w-xs">
              {recentFiles.map((path) => (
                <DropdownMenuItem
                  key={path}
                  className="truncate"
                  title={path}
                  onClick={() => requestAction({ type: 'openPath', path })}
                >
                  {basenameFromPath(path)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving}
            title={`保存 (${modKeyLabel}+S)`}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            <span className="hidden sm:inline">保存</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleSaveAs()} title="另存为">
            <FileDown className="size-4" />
            <span className="hidden sm:inline">另存为</span>
          </Button>
        </div>

        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="sm" onClick={handleBeautify} title="格式化">
            <AlignLeft className="size-4" />
            <span className="hidden sm:inline">格式化</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleCompact} title="压缩">
            <Minimize2 className="size-4" />
            <span className="hidden sm:inline">压缩</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleCopyFormatted()} title="复制格式化 JSON">
            <Copy className="size-4" />
            <span className="hidden md:inline">复制</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleCopyCompact()}
            title="复制压缩 JSON"
            className="hidden md:inline-flex"
          >
            <Copy className="size-4" />
            压缩复制
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handlePasteFromClipboard()}
            title="从剪贴板导入 JSON"
          >
            <ClipboardPaste className="size-4" />
            <span className="hidden lg:inline">粘贴导入</span>
          </Button>
        </div>

        <div className="ml-auto">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as JsonEditorViewMode)}>
            <TabsList variant="line" className="h-8">
              <TabsTrigger value="tree" className="gap-1 px-2 text-xs sm:px-3 sm:text-sm">
                <Braces className="size-3.5" />
                树形
              </TabsTrigger>
              <TabsTrigger value="text" className="px-2 text-xs sm:px-3 sm:text-sm">
                文本
              </TabsTrigger>
              <TabsTrigger value="split" className="gap-1 px-2 text-xs sm:px-3 sm:text-sm">
                <Columns2 className="size-3.5" />
                分屏
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="relative isolate min-h-0 flex-1 overflow-hidden">
        {fileDragActive && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/10 backdrop-blur-[1px]">
            <div className="rounded-lg border border-dashed border-primary/50 bg-background/90 px-6 py-4 text-sm text-foreground shadow-sm">
              松开以打开 JSON 文件
            </div>
          </div>
        )}
        {viewMode === 'split' ? (
          <JsonEditorSplitView
            key={editorSession}
            content={content}
            isDarkMode={isDarkMode}
            initialSplitRatio={splitRatio}
            onSplitRatioChange={setSplitRatio}
            onChange={handleChange}
            onError={handleEditorError}
          />
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full flex-col gap-2 p-4">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-full w-full" />
              </div>
            }
          >
            <LazyVanillaJsonEditor
              key={editorSession}
              className="h-full w-full"
              isDarkMode={isDarkMode}
              content={content}
              mode={viewModeToEditorMode(viewMode)}
              onChange={handleChange}
              onChangeMode={handleEditorModeChange}
              onError={handleEditorError}
              mainMenuBar={false}
              navigationBar
              statusBar={false}
              askToFormat={false}
            />
          </Suspense>
        )}
      </main>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="truncate font-medium text-foreground">{displayName}</span>
        {dirty && (
          <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
            未保存
          </span>
        )}
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5',
            isValid
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'bg-destructive/15 text-destructive'
          )}
        >
          {isValid ? '✓ 有效' : '✗ 无效'}
        </span>
        {!isValid && errorMessage && (
          <span className="min-w-0 flex-1 truncate" title={errorMessage}>
            {errorMessage}
          </span>
        )}
      </footer>

      <AlertDialog open={unsavedPrompt !== null} onOpenChange={(open) => !open && setUnsavedPrompt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{unsavedDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{unsavedDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="outline" onClick={handleUnsavedDiscard}>
              不保存
            </Button>
            <AlertDialogAction onClick={() => void handleUnsavedSaveAndContinue()}>
              {unsavedDialog.saveLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
