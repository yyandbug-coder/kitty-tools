# Kitty Tools

基于 Tauri v2 + React 的桌面工具集（翻译 + 剪贴板历史）。

## 开发

```bash
pnpm install
pnpm tauri dev
```

## 发版（打包 / 上传）

**日常发版请使用交互式向导**（不要直接 `pnpm tauri build` 作为发版手段）：

```bash
pnpm create:release
# 或
pnpm release
```

- 发版指南：[docs/RELEASE.md](./docs/RELEASE.md)
- 本项目索引：`.cursor/skills/tauri-app-updater/`

CI / 脚本使用：`pnpm release:cli`

## Agent Skills（可安装到其他项目）

本仓库在 `skills/` 目录发布 Agent Skills，可通过 Skills CLI 安装：

```bash
# 全局安装 tauri-app-updater
npx skills add yyandbug-coder/kitty-tools --skill tauri-app-updater -g -y

# 或使用 pnpm
pnpm dlx skills add yyandbug-coder/kitty-tools --skill tauri-app-updater -g -y
```

安装后接入任意 Tauri 项目：

```bash
node ~/.agents/skills/tauri-app-updater/scripts/init-project.mjs
pnpm install
```

更多技能见 [skills/README.md](./skills/README.md)。

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
