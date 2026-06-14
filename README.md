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
- Skill 安装：`npx skills add yyandbug-coder/kitty-tools --skill tauri-app-updater -g -y`
- 本项目索引：`.cursor/skills/tauri-app-updater/`

CI / 脚本使用：`pnpm release:cli`

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
