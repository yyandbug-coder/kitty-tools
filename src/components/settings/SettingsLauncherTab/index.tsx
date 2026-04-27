// 设置 — 启动器：浏览器书签来源与本地文件搜索
import { open } from '@tauri-apps/plugin-dialog'
import { FolderOpen, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEFAULT_LAUNCHER_FILE_SEARCH_EXCLUDED_DIR_NAMES, type AppConfig } from '@/types'

export interface SettingsLauncherTabProps {
  config: AppConfig
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>
  launcherExcludedDirNames: string[]
  launcherExcludeDirInput: string
  setLauncherExcludeDirInput: (v: string) => void
}

export default function SettingsLauncherTab({
  config,
  updateConfig,
  launcherExcludedDirNames,
  launcherExcludeDirInput,
  setLauncherExcludeDirInput,
}: SettingsLauncherTabProps) {
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Search className="size-4" />
            浏览器书签
          </CardTitle>
          <p className="text-xs text-muted-foreground leading-relaxed">
            勾选后，启动器可搜索并打开对应浏览器的书签（读取本机 Chromium 格式 Bookmarks
            文件）。请确保已安装并使用该浏览器；可多选。
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Google Chrome</span>
            <Switch
              checked={config.launcherBookmarksChrome}
              onCheckedChange={(v) => void updateConfig({ launcherBookmarksChrome: v })}
              aria-label="Chrome 书签"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Microsoft Edge</span>
            <Switch
              checked={config.launcherBookmarksEdge}
              onCheckedChange={(v) => void updateConfig({ launcherBookmarksEdge: v })}
              aria-label="Edge 书签"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Brave</span>
            <Switch
              checked={config.launcherBookmarksBrave}
              onCheckedChange={(v) => void updateConfig({ launcherBookmarksBrave: v })}
              aria-label="Brave 书签"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FolderOpen className="size-4" />
            本地文件搜索
          </CardTitle>
          <p className="text-xs text-muted-foreground leading-relaxed">
            普通搜索会从本机<strong className="font-medium text-foreground">已安装应用</strong>（Windows 开始菜单快捷方式、macOS「应用程序」）中匹配名称，无需此前缀。
            在指定目录内按<strong className="font-medium text-foreground">文件名</strong>
            包含关键词搜索时，须先在输入框输入 <span className="font-mono text-foreground/90">find </span>/
            <span className="font-mono text-foreground/90">open </span>
            再加关键词；<span className="font-mono text-foreground/90">find</span> 会合并开始菜单/应用程序等默认范围（与 Alfred 常用 reveal/open 范围类似）。在输入框中输入{' '}
            <span className="font-mono text-foreground/90">find </span>+ 关键词为仅文件搜索，选中后
            <strong className="font-medium text-foreground">打开该文件所在目录</strong>；输入{' '}
            <span className="font-mono text-foreground/90">open </span>+ 关键词为仅文件搜索，选中后
            <strong className="font-medium text-foreground">打开该文件</strong>。关键词至少 2 个字符。目录列表为空时使用系统「文档」文件夹。多根目录会并行扫描；仅添加常用文件夹可明显加快。整盘搜索仍可能较慢。可在下方配置「排除的目录名」以跳过如{' '}
            <span className="font-mono text-foreground/90">node_modules</span>、
            <span className="font-mono text-foreground/90">dist</span> 等（仅按路径中<strong className="font-medium text-foreground">单级文件夹名</strong>匹配，大小写不敏感）。
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">启用文件搜索</span>
            <Switch
              checked={config.launcherFileSearchEnabled}
              onCheckedChange={(v) => void updateConfig({ launcherFileSearchEnabled: v })}
              aria-label="启用启动器文件搜索"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!config.launcherFileSearchEnabled}
              onClick={async () => {
                try {
                  const dir = await open({ directory: true, multiple: false })
                  if (typeof dir !== 'string' || !dir.trim()) return
                  const paths = config.launcherFileSearchPaths
                  if (paths.includes(dir)) return
                  await updateConfig({ launcherFileSearchPaths: [...paths, dir] })
                } catch (e) {
                  console.error(e)
                }
              }}
            >
              添加搜索目录
            </Button>
            {config.launcherFileSearchPaths.length > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void updateConfig({ launcherFileSearchPaths: [] })}>
                清空列表（使用「文档」默认）
              </Button>
            ) : null}
          </div>
          {config.launcherFileSearchPaths.length > 0 ? (
            <ul className="border-border bg-muted/30 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 text-sm">
              {config.launcherFileSearchPaths.map((p) => (
                <li
                  key={p}
                  className="text-muted-foreground flex min-w-0 items-start justify-between gap-2 break-all"
                >
                  <span className="min-w-0">{p}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0"
                    aria-label="移除目录"
                    onClick={() =>
                      void updateConfig({
                        launcherFileSearchPaths: config.launcherFileSearchPaths.filter((x) => x !== p),
                      })
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-xs">未添加目录时，使用系统「文档」作为搜索根目录。</p>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">排除的目录名</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              与某一级文件夹名（不含路径）一致则<strong className="font-medium text-foreground/90">不进入</strong>
              该目录及其子文件。对以 <span className="font-mono">.</span> 开头的目录（如{' '}
              <span className="font-mono">.git</span>）除列表外，也会在深层默认跳过以点号开头的目录。
            </p>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="min-w-0 flex-1"
                value={launcherExcludeDirInput}
                onChange={(e) => setLauncherExcludeDirInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const t = launcherExcludeDirInput.trim()
                    if (!t) return
                    const cur = launcherExcludedDirNames
                    if (cur.some((x) => x.toLowerCase() === t.toLowerCase())) {
                      setLauncherExcludeDirInput('')
                      return
                    }
                    void updateConfig({ launcherFileSearchExcludedDirNames: [...cur, t] })
                    setLauncherExcludeDirInput('')
                  }
                }}
                placeholder="例如 .next 或 out"
                disabled={!config.launcherFileSearchEnabled}
                autoComplete="off"
                spellCheck={false}
                aria-label="添加排除的目录名"
              />
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!config.launcherFileSearchEnabled || !launcherExcludeDirInput.trim()}
                  onClick={() => {
                    const t = launcherExcludeDirInput.trim()
                    if (!t) return
                    const cur = launcherExcludedDirNames
                    if (cur.some((x) => x.toLowerCase() === t.toLowerCase())) {
                      setLauncherExcludeDirInput('')
                      return
                    }
                    void updateConfig({ launcherFileSearchExcludedDirNames: [...cur, t] })
                    setLauncherExcludeDirInput('')
                  }}
                >
                  添加
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!config.launcherFileSearchEnabled}
                  onClick={() =>
                    void updateConfig({
                      launcherFileSearchExcludedDirNames: [...DEFAULT_LAUNCHER_FILE_SEARCH_EXCLUDED_DIR_NAMES],
                    })
                  }
                >
                  恢复默认
                </Button>
              </div>
            </div>
            {launcherExcludedDirNames.length > 0 ? (
              <ul className="border-border bg-muted/30 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 text-sm">
                {launcherExcludedDirNames.map((name) => (
                  <li
                    key={name}
                    className="text-muted-foreground font-mono flex min-w-0 items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">{name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0"
                      aria-label={`移除 ${name}`}
                      disabled={!config.launcherFileSearchEnabled}
                      onClick={() =>
                        void updateConfig({
                          launcherFileSearchExcludedDirNames: launcherExcludedDirNames.filter((x) => x !== name),
                        })
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">
                未配置时将为空；点击「恢复默认」可填回 node_modules、dist、target 等常见构建目录名。
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
