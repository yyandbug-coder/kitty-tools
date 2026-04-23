// 欢迎引导页 - 首次使用时展示功能介绍
import { useState, useEffect } from 'react';
import { useAppConfig } from '@/hooks/useAppConfig';
import { Button } from '@/components/ui/button';
import { ClipboardList, Languages, Camera, Sparkles } from 'lucide-react';
import AppLogoIcon from '@/components/shared/AppLogoIcon';

export default function WelcomeOnboarding() {
  const { updateConfig } = useAppConfig();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleComplete = async () => {
    await updateConfig({ firstRun: false });
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  };

  const features = [
    {
      icon: ClipboardList,
      title: '剪贴板历史',
      shortcut: 'Ctrl+Shift+V',
    },
    {
      icon: Languages,
      title: '划词翻译',
      shortcut: 'Ctrl+Shift+T',
    },
    {
      icon: Camera,
      title: '截图翻译',
      shortcut: 'Ctrl+Shift+S',
    },
  ];

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground p-8">
      <AppLogoIcon className="size-16 mb-4" />
      <Sparkles className="size-6 text-primary mb-2" />
      <h1 className="text-2xl font-bold mb-2">欢迎使用 Kitty Tools</h1>
      <p className="text-sm text-muted-foreground text-center mb-8 max-w-md">
        集剪贴板管理与翻译于一体的桌面工具箱。
        <br />应用将在系统托盘中运行，通过全局快捷键呼出。
      </p>
      <div className="space-y-3 text-sm mb-8 w-full max-w-xs">
        {features.map(({ icon: Icon, title, shortcut }) => (
          <div key={title} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
            <Icon className="size-5 text-primary shrink-0" />
            <div className="flex-1">
              <div className="font-medium">{title}</div>
              <div className="text-xs text-muted-foreground">快捷键: {shortcut}</div>
            </div>
          </div>
        ))}
      </div>
      <Button
        onClick={handleComplete}
        disabled={countdown > 0}
        className="px-8"
      >
        {countdown > 0 ? `请先了解功能 (${countdown}s)` : '开始使用'}
      </Button>
    </div>
  );
}
