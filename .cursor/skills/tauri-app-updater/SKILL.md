---
name: tauri-app-updater
description: >-
  Tauri v2 应用内自动更新与 GitCode Release 交互式发版。涵盖 latest.json、签名构建、上传下载踩坑、
  app_updater Rust 封装与 create:release 向导。在用户提及 Tauri 更新、发版、打包上传、
  latest.json、GitCode Release、updater 报错或 release 脚本时使用。
---

# Tauri 应用自动更新与发版

## 强制约定

1. **日常发版/打包**必须使用交互式命令：
   ```bash
   pnpm create:release
   # 或
   pnpm release
   ```
2. **CI / 自动化**使用非交互底层：`pnpm release:cli --part patch --upload`
3. **故障排查**先读 [pitfalls.md](pitfalls.md)，再按 [reference.md](reference.md) 逐项检查。

## 架构（Cursor 官方标准）

Skill = 自包含目录，脚本放在 `scripts/` 内（见 Cursor create-skill 规范）：

```
.cursor/skills/tauri-app-updater/
├── SKILL.md
├── pitfalls.md
├── reference.md
├── templates/
└── scripts/              ← 发版逻辑在这里
    ├── release-interactive.mjs
    ├── release.mjs
    └── init-project.mjs
```

项目侧只需 `release.config.json` + 薄封装 `scripts/updater-skill.mjs`。

## 跨电脑 / 多项目（无需 npm 应用包）

| 场景 | 做法 |
|------|------|
| 同一仓库换电脑 | **项目 Skill 进 git**：clone 后自带 `.cursor/skills/`，`pnpm install` 即可 |
| 多个不同项目复用 | **Skills CLI 全局安装**：`npx skills add <owner/repo@tauri-app-updater> -g` |
| 新项目接入 | `node .cursor/skills/tauri-app-updater/scripts/init-project.mjs` |

> Skills CLI（`npx skills`）是 Skill 生态的分发标准，安装的是 Skill 文件夹，不是 npm 应用包。

`updater-skill.mjs` 查找顺序：**项目 `.cursor/skills/` 优先** → 全局 `~/.cursor/skills/` 兜底。

## 新项目接入

```bash
node .cursor/skills/tauri-app-updater/scripts/init-project.mjs
pnpm install
```

然后编辑 `release.config.json`，配置 Tauri updater（见 reference.md）。

## 命令约定

| 命令 | 用途 |
|------|------|
| `pnpm create:release` | 交互式发版（主入口） |
| `pnpm release` | 同 create:release |
| `pnpm release:cli` | 非交互底层（CI） |
| `pnpm release:publish` | push + upload |
| `pnpm release:upload` | 仅上传 artifacts |
| `pnpm release:json` | 仅生成 latest.json |

## 附加资源

- 踩坑矩阵：[pitfalls.md](pitfalls.md)
- 模块清单与验证：[reference.md](reference.md)
- 本项目配置索引：[PROJECT.md](PROJECT.md)
