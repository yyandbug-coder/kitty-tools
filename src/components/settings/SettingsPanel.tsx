// 设置面板 - 应用全局设置（通用/剪贴板/翻译）
import { useAppConfig } from '@/hooks/useAppConfig';
import { useTheme } from '@/hooks/useTheme';
import { SUPPORTED_LANGUAGES, getProviderDisplayName, type TranslateProvider } from '@/types';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings,
  ClipboardList,
  Languages,
  Sun,
  Moon,
  Monitor,
  Zap,
  Keyboard,
  Eye,
  Loader2,
} from 'lucide-react';

export default function SettingsPanel() {
  const { config, updateConfig, loaded } = useAppConfig();
  const [tab, setTab] = useState('general');
  const [testing, setTesting] = useState(false);
  useTheme(config.theme);

  if (!loaded) return <div className="p-4 text-muted-foreground">加载中...</div>;

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      await invoke('test_translate_connection', { provider: config.translateProvider, config });
      toast.success('连接测试成功');
    } catch (e) {
      toast.error(`连接失败: ${e}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* 标题栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <Settings className="size-4 text-primary" />
        <h1 className="text-sm font-semibold">Kitty Tools 设置</h1>
      </div>

      {/* 标签页 */}
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-3 w-fit">
          <TabsTrigger value="general" className="gap-1.5 text-xs">
            <Zap className="size-3" />
            通用
          </TabsTrigger>
          <TabsTrigger value="clipboard" className="gap-1.5 text-xs">
            <ClipboardList className="size-3" />
            剪贴板
          </TabsTrigger>
          <TabsTrigger value="translate" className="gap-1.5 text-xs">
            <Languages className="size-3" />
            翻译
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 mt-2">
          <div className="p-4 space-y-6">

            {/* 通用 */}
            <TabsContent value="general" className="space-y-5 mt-0">
              <div className="space-y-2">
                <label className="text-sm font-medium">外观</label>
                <div className="flex gap-2">
                  {([
                    { value: 'system', icon: Monitor, label: '跟随系统' },
                    { value: 'light', icon: Sun, label: '浅色' },
                    { value: 'dark', icon: Moon, label: '深色' },
                  ] as const).map(({ value, icon: Icon, label }) => (
                    <Button
                      key={value}
                      variant={config.theme === value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateConfig({ theme: value })}
                      className="text-xs gap-1.5"
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">开机自启动</label>
                  <p className="text-xs text-muted-foreground">登录后自动在托盘运行</p>
                </div>
                <Switch
                  checked={config.launchOnStartup}
                  onCheckedChange={(v) => updateConfig({ launchOnStartup: v })}
                />
              </div>
            </TabsContent>

            {/* 剪贴板 */}
            <TabsContent value="clipboard" className="space-y-5 mt-0">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Keyboard className="size-3.5" />
                  全局快捷键
                </label>
                <Input
                  type="text"
                  value={config.clipboardShortcut}
                  readOnly
                  className="text-xs"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">失焦自动隐藏</label>
                  <p className="text-xs text-muted-foreground">失去焦点后自动隐藏面板</p>
                </div>
                <Switch
                  checked={config.clipboardHideOnUnfocus}
                  onCheckedChange={(v) => updateConfig({ clipboardHideOnUnfocus: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">回车粘贴</label>
                  <p className="text-xs text-muted-foreground">按回车键直接粘贴选中项</p>
                </div>
                <Switch
                  checked={config.clipboardPasteOnEnter}
                  onCheckedChange={(v) => updateConfig({ clipboardPasteOnEnter: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Eye className="size-3.5" />
                    显示预览
                  </label>
                  <p className="text-xs text-muted-foreground">在侧边栏显示内容预览</p>
                </div>
                <Switch
                  checked={config.clipboardShowPreview}
                  onCheckedChange={(v) => updateConfig({ clipboardShowPreview: v })}
                />
              </div>
            </TabsContent>

            {/* 翻译 */}
            <TabsContent value="translate" className="space-y-5 mt-0">
              <div className="space-y-2">
                <label className="text-sm font-medium">翻译引擎</label>
                <div className="flex flex-wrap gap-2">
                  {(['youdao', 'baidu', 'google', 'openai'] as TranslateProvider[]).map(p => (
                    <Button
                      key={p}
                      variant={config.translateProvider === p ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateConfig({ translateProvider: p })}
                      className="text-xs"
                    >
                      {getProviderDisplayName(p)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs text-muted-foreground">源语言</label>
                  <Select
                    value={config.sourceLang}
                    onValueChange={(v) => updateConfig({ sourceLang: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LANGUAGES.map(l => (
                        <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs text-muted-foreground">目标语言</label>
                  <Select
                    value={config.targetLang}
                    onValueChange={(v) => updateConfig({ targetLang: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LANGUAGES.filter(l => l.code !== 'auto').map(l => (
                        <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {config.translateProvider === 'youdao' && (
                <div className="space-y-2">
                  <Input placeholder="应用 ID" value={config.youdao.appKey} onChange={e => updateConfig({ youdao: { ...config.youdao, appKey: e.target.value } })} className="text-xs" />
                  <Input placeholder="应用密钥" type="password" value={config.youdao.appSecret} onChange={e => updateConfig({ youdao: { ...config.youdao, appSecret: e.target.value } })} className="text-xs" />
                </div>
              )}
              {config.translateProvider === 'baidu' && (
                <div className="space-y-2">
                  <Input placeholder="App ID" value={config.baidu.appId} onChange={e => updateConfig({ baidu: { ...config.baidu, appId: e.target.value } })} className="text-xs" />
                  <Input placeholder="密钥" type="password" value={config.baidu.secret} onChange={e => updateConfig({ baidu: { ...config.baidu, secret: e.target.value } })} className="text-xs" />
                </div>
              )}
              {config.translateProvider === 'openai' && (
                <div className="space-y-2">
                  <Input placeholder="API Base URL" value={config.openai.apiBaseUrl} onChange={e => updateConfig({ openai: { ...config.openai, apiBaseUrl: e.target.value } })} className="text-xs" />
                  <Input placeholder="API Key" type="password" value={config.openai.apiKey} onChange={e => updateConfig({ openai: { ...config.openai, apiKey: e.target.value } })} className="text-xs" />
                  <Input placeholder="Model" value={config.openai.model} onChange={e => updateConfig({ openai: { ...config.openai, model: e.target.value } })} className="text-xs" />
                </div>
              )}
              {config.translateProvider === 'google' && (
                <div className="space-y-2">
                  <Input placeholder="API Key" type="password" value={config.google.apiKey} onChange={e => updateConfig({ google: { ...config.google, apiKey: e.target.value } })} className="text-xs" />
                </div>
              )}

              <Button onClick={handleTestConnection} disabled={testing} size="sm" className="text-xs">
                {testing ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Zap className="size-3.5 mr-1" />}
                测试连接
              </Button>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Keyboard className="size-3.5" />
                  翻译快捷键
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">划词翻译</label>
                    <Input type="text" value={config.hotkeySelection} readOnly className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">截图翻译</label>
                    <Input type="text" value={config.hotkeyScreenshot} readOnly className="text-xs" />
                  </div>
                </div>
              </div>
            </TabsContent>

          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
