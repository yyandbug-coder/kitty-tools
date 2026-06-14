---
name: tauri-app-updater
description: >-
  Tauri v2 应用内自动更新与 GitCode Release 交互式发版。涵盖 latest.json、签名构建、上传下载踩坑、
  app_updater Rust 封装与 create:release 向导。在用户提及 Tauri 更新、发版、打包上传、
  latest.json、GitCode Release、updater 报错或 release 脚本时使用。
---

# Tauri 应用自动更新与发版

## 安装（其他项目，两条命令）

```bash
# 1. 安装 Skill（每台电脑一次，和别的 skill 一样）
npx skills add https://gitcode.com/yyandbug/kitty-tools.git --skill tauri-app-updater -g -y

# 2. 接入当前 Tauri 项目（每个项目一次）
node ~/.agents/skills/tauri-app-updater/scripts/init-project.mjs
pnpm install
```

Windows 第 2 步：

```powershell
node $env:USERPROFILE\.agents\skills\tauri-app-updater\scripts\init-project.mjs
```

然后编辑 `release.config.json`，按 [reference.md](reference.md) 配置 Tauri updater。

## 日常发版

```bash
pnpm create:release
# 或
pnpm release
```

CI：`pnpm release:cli --part patch --upload`

## 架构

```
skills/tauri-app-updater/     # 标准 Skill 目录（npx skills 可发现）
└── scripts/                  # 发版逻辑
project/
├── release.config.json
└── scripts/updater-skill.mjs # init-project 生成的薄封装
```

`updater-skill.mjs` 自动查找：`skills/` → `.agents/skills/` → `.cursor/skills/`（项目优先，再全局）。

## 附加资源

- 踩坑：[pitfalls.md](pitfalls.md)
- 配置清单：[reference.md](reference.md)
