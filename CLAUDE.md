# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**kitty-tools** is a collection of Tauri v2 desktop applications built with React + TypeScript. The repo contains a root scaffold app and two feature-complete example apps under `example/`. All apps target Windows and macOS.

- **Root** (`./`) — Initial Tauri v2 scaffold (not yet developed)
- **example/kitty-clipboard-history** — Clipboard history tool with Alfred-style popup UI, global hotkey, transparent window
- **example/kitty-translate** — Translation tool (selection translate + screenshot translate)

## Tech Stack (shared across all apps)

- **Frontend**: React 19 + TypeScript, Vite 7
- **Backend**: Rust (Tauri v2)
- **UI**: shadcn/ui + Tailwind CSS v4 + Lucide icons
- **Package Manager**: pnpm

## Commands

All commands should be run from the relevant project directory (root, `example/kitty-clipboard-history/`, or `example/kitty-translate/`).

```bash
pnpm install              # install dependencies
pnpm tauri dev            # start dev mode (Vite dev server + Tauri window)
pnpm tauri build          # production build (frontend + Rust)
pnpm build                # frontend only (tsc && vite build)
pnpm dev                  # Vite dev server only (port 1420, no Tauri window)
```

## Architecture

Each app follows the same structure:

```
src/                → React frontend (entry: src/main.tsx → src/App.tsx)
src-tauri/          → Rust backend (entry: src-tauri/src/main.rs → src-tauri/src/lib.rs)
src/components/ui/  → shadcn/ui components
```

- The Rust lib crate uses an underscored name (e.g. `kitty_tools_lib`) to avoid Windows naming conflicts with the binary.
- Rust commands are defined with `#[tauri::command]` in `lib.rs` and registered via `generate_handler![]`. The frontend calls them with `invoke()` from `@tauri-apps/api/core`.
- Tauri permissions/capabilities are in `src-tauri/capabilities/default.json`.
- Vite dev server runs on fixed port 1420 (`strictPort: true`). The `src-tauri/` directory is excluded from Vite's file watcher.

## Development Conventions (from example app CLAUDE.md files)

- Use react-hot-toast for notifications, never `alert()`
- Use only shadcn/ui components; no other component libraries. If shadcn/ui lacks a component, build it with Tailwind CSS matching shadcn/ui style
- All UIs must be responsive and compatible with both Windows and macOS
- Use dayjs for date handling, never native `Date` or other date libraries
- Add page-level comments describing each page's purpose
- Non-UI components in `src/components/` must follow the `ComponentName/index.tsx` pattern
- TypeScript: no `any`, use interfaces for props, types in `src/types/`
- React: function components + hooks only, PascalCase components, `handleXxx` for event handlers
- Rust: snake_case for variables/functions, PascalCase for structs
- Git commits: `<type>: <description>` with types: feat, fix, ui, refactor, docs, perf, build, chore

# 开发规范

## 使用中文回答

1、系统中的提示统一使用 react-hot-toast ，不要使用 alert

2、所组件必须使用 shadcn/ui 库中的组件，不要使用其他的组件库，不要自己写组件，像 input，button等也不要使用原生组件，除非 shadcn/ui 中没有提供相关的组件，如果 shadcn/ui 中没有提供相关组件，可以使用 tailwind css 来实现样式，但组件的交互逻辑必须自己实现，不能使用其他的组件库来实现交互逻辑，组件的样式也要尽量和 shadcn/ui 中的组件保持一致，不要有太大的差异

3、需要严格保证 pc 和移动端都套兼容

4、确保所有的功能要支持 windows、macos，并且要响应式设计，适配不同的屏幕尺寸和分辨率

5、日期处理统一使用 dayjs 库，不要使用其他的日期处理库，也不要使用原生的 Date 对象

6、每个页面头部都需要添加注释，说明该页面的功能和用途

7、系统导出文件的功能需要同步支持 windows、macos

8、components 目录下除了 ui，其他组件格式必须为xxx/index.tsx