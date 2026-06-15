# tauri-app-updater

Tauri v2 应用内自动更新与 GitCode / GitHub Release 交互式发版 Skill。

## 安装

```bash
# 全局安装（推荐，每台电脑一次）
npx skills add yyandbug-coder/kitty-tools --skill tauri-app-updater -g -y

# 或使用 pnpm
pnpm dlx skills add yyandbug-coder/kitty-tools --skill tauri-app-updater -g -y
```

## 接入 Tauri 项目

```bash
node ~/.agents/skills/tauri-app-updater/scripts/init-project.mjs
pnpm install
```

Windows：

```powershell
node $env:USERPROFILE\.agents\skills\tauri-app-updater\scripts\init-project.mjs
```

## 日常发版

```bash
pnpm create:release
```

## 文档

- [SKILL.md](./SKILL.md) — Agent 使用说明
- [reference.md](./reference.md) — 配置与命令参考
- [pitfalls.md](./pitfalls.md) — 踩坑矩阵

## 仓库

<https://github.com/yyandbug-coder/kitty-tools/tree/master/skills/tauri-app-updater>
