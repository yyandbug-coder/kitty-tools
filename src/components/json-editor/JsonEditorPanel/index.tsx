/**
 * JSON 编辑器面板：工具栏（新建/打开/保存/格式化/压缩/模式切换）、编辑区（单栏或分屏预览）、状态栏。
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import toast from 'react-hot-toast'
import {
  AlignLeft,
  Braces,
  Columns2,
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
import {
  basenameFromPath,
  beautifyContent,
  compactContent,
  contentToFileText,
  createDefaultJsonContent,
  isJsonContentValid,
  textToEditorContent,
} from '@/lib/json-editor'
import type { JsonEditorViewMode } from '@/types/json-editor'
import JsonEditorSplitView from '@/components/json-editor/JsonEditorSplitView'

const LazyVanillaJsonEditor = lazy(() => import('@/components/json-editor/VanillaJsonEditor'))

function viewModeToEditorMode(mode: JsonEditorViewMode): Mode {
  return mode === 'text' ? Mode.text : Mode.tree
}

function editorModeToViewMode(mode: Mode): JsonEditorViewMode {
  return mode === Mode.text ? 'text' : 'tree'
}

export default function JsonEditorPanel({ isDarkMode }: { isDarkMode: boolean }) {
  const [content, setContent] = useState<Content>(() => createDefaultJsonContent())
  const [editorSession, setEditorSession] = useState(0)
  const [viewMode, setViewMode] = useState<JsonEditorViewMode>('tree')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [contentErrors, setContentErrors] = useState<ContentErrors | undefined>(undefined)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const baselineRef = useRef<string>('')

  const isValid = isJsonContentValid(contentErrors)
  const displayName = filePath ? basenameFromPath(filePath) : '未命名.json'

  const markBaseline = useCallback((nextContent: Content) => {
    baselineRef.current = contentToFileText(nextContent, 2) ?? ''
    setDirty(false)
  }, [])

  const handleChange = useCallback(
    (next: Content, _prev: Content, status: { contentErrors: ContentErrors | undefined }) => {
      setContent(next)
      setContentErrors(status.contentErrors)
      const serialized = contentToFileText(next, 2) ?? ''
      setDirty(serialized !== baselineRef.current)
    },
    []
  )

  const handleNew = useCallback(() => {
    const next = createDefaultJsonContent()
    setContent(next)
    setContentErrors(undefined)
    setFilePath(null)
    markBaseline(next)
    setViewMode('tree')
    setEditorSession((n) => n + 1)
  }, [markBaseline])

  const handleOpen = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (!selected || typeof selected !== 'string') return

      const text = await readTextFile(selected)
      const next = textToEditorContent(text)
      setContent(next)
      setContentErrors(undefined)
      setFilePath(selected)
      markBaseline(next)
      toast.success(`已打开 ${basenameFromPath(selected)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '打开文件失败')
    }
  }, [markBaseline])

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

  const handleEditorError = useCallback((err: unknown) => {
    toast.error(err instanceof Error ? err.message : String(err))
  }, [])

  const hideWindow = useCallback(async () => {
    await getCurrentWindow().hide()
  }, [])

  const handleConfirmCloseWithoutSave = useCallback(async () => {
    setCloseDialogOpen(false)
    await hideWindow()
  }, [hideWindow])

  const handleConfirmSaveAndClose = useCallback(async () => {
    const ok = await handleSave()
    if (ok) {
      setCloseDialogOpen(false)
      await hideWindow()
    }
  }, [handleSave, hideWindow])

  useEffect(() => {
    markBaseline(createDefaultJsonContent())
  }, [markBaseline])

  useEffect(() => {
    let unlistenFocus: (() => void) | undefined
    let unlistenClose: (() => void) | undefined

    void listen('focus-json-editor-panel', () => {
      if (filePath) return
      setContent((prev) => {
        const serialized = contentToFileText(prev, 2) ?? ''
        const isBlank =
          serialized.trim() === '' ||
          serialized.trim() === '{\n  \n}' ||
          serialized.trim() === '{}'
        if (!isBlank) return prev
        setEditorSession((n) => n + 1)
        return createDefaultJsonContent()
      })
    }).then((fn) => {
      unlistenFocus = fn
    })

    void listen('json-editor-close-requested', () => {
      if (dirty) {
        setCloseDialogOpen(true)
        return
      }
      void hideWindow()
    }).then((fn) => {
      unlistenClose = fn
    })

    return () => {
      unlistenFocus?.()
      unlistenClose?.()
    }
  }, [dirty, filePath, hideWindow])

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="sm" onClick={handleNew} title="新建">
            <FilePlus2 className="size-4" />
            <span className="hidden sm:inline">新建</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleOpen()} title="打开">
            <FolderOpen className="size-4" />
            <span className="hidden sm:inline">打开</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving}
            title="保存"
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
        </div>

        <div className="ml-auto">
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as JsonEditorViewMode)}
          >
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
        {viewMode === 'split' ? (
          <JsonEditorSplitView
            key={editorSession}
            content={content}
            isDarkMode={isDarkMode}
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
              onChangeMode={(mode) => setViewMode(editorModeToViewMode(mode))}
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
      </footer>

      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>未保存的更改</AlertDialogTitle>
            <AlertDialogDescription>
              当前文档有未保存的修改，关闭前是否保存？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => void handleConfirmCloseWithoutSave()}>
              不保存
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmSaveAndClose()}>
              保存并关闭
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
