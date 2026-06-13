---
name: generate-project-dev-standards
description: >-
  Analyzes the open workspace and produces a Markdown development standards document
  grounded in repository facts (stack, tooling, structure, existing rules). Use when
  the user asks to generate project dev guidelines, 开发规范, CONTRIBUTING-style
  conventions, or to refresh CLAUDE.md/AGENTS.md from the codebase.
---

# 根据当前项目生成开发规范

## 目标

基于**当前工作区真实文件与配置**输出一份结构化《开发规范》（Markdown），便于写入 `CLAUDE.md`、`AGENTS.md`、`.cursor/rules` 或团队文档。规范中的每一条应尽量能在仓库中找到依据；无法确认的内容单独列入「待确认」。

## 何时先读再写

若仓库已存在下列文件，**先阅读再归纳**，避免与现有一致性冲突：

- `CLAUDE.md`、`AGENTS.md`、`CONTRIBUTING.md`、`README.md`
- `.cursor/rules/**`、`eslint.config.*`、`.prettierrc*`、`biome.json`
- `package.json`（及 monorepo 下各子包 `package.json`）
- `tsconfig*.json`、`vite.config.*`、`next.config.*` 等构建配置
- `src-tauri/**` 或 `tauri.conf.json`（Tauri）
- `rustfmt.toml`、`Cargo.toml`（Rust）
- `components.json`（shadcn/ui）

## 调研步骤（按优先级）

1. **识别项目类型**：Web / 桌面（Tauri、Electron）/ 移动端 / 纯后端等，依据依赖与目录命名，不要凭感觉。
2. **技术栈与版本**：从 `package.json`、`Cargo.toml` 等提取运行时、框架、主要库；版本只写仓库里实际声明的，不猜测升级路径。
3. **命令与工作流**：从 `package.json` 的 `scripts`、文档、CI（`.github/workflows` 等）归纳常用命令（安装、dev、build、lint、test）。
4. **目录与模块约定**：根据 `src/`、`apps/`、`packages/` 等实际结构总结放置规则（例如组件目录模式、类型文件位置）。
5. **代码风格**：从 ESLint/Prettier/Biome 配置与既有代码风格归纳；若无配置则说明「以现有代码为准」并举例典型模式。
6. **跨平台与 UI**：若存在 Tauri、路径 API、或文档强调 Windows/macOS，规范中写明平台注意点（路径、权限、打包）。
7. **仓库特殊规则**：若存在只读目录（如 `example/` 仅供参考）、子项目边界，必须在规范中**显式写出**，避免误改。

## 输出文档结构（模板）

生成时使用以下一级标题顺序，缺证据的章节写「待补充」或「待确认」：

```markdown
# [项目名称] 开发规范

> 生成依据：[列出关键文件路径，如 package.json、CLAUDE.md]

## 1. 项目概述
- 产品形态、目标平台、仓库布局（根目录与子项目）

## 2. 技术栈与工具链
- 语言/框架/主要库（带版本来源说明）
- 包管理器、Node 版本要求（若可从配置推断）

## 3. 环境与常用命令
- 安装、开发、构建、类型检查、格式化、测试

## 4. 目录结构与代码组织
- 源码入口、分层方式、公共组件/类型/工具放置规则

## 5. 前端 / UI 规范
- 组件库、样式方案、路由/状态（若适用）
- 可访问性、响应式、通知与错误展示约定（若仓库有先例）

## 6. 后端 / 原生 / Tauri（若适用）
- 命令注册、权限、与前端通信约定

## 7. 类型与质量
- TypeScript 严格程度、禁止模式（如 any）、测试策略

## 8. Git 与协作
- 分支/PR（若有文档）、commit message 约定（若仓库或现有规范中有）

## 9. 与现有文档的关系
- 与 CLAUDE.md / AGENTS.md 的差异或合并建议（若有）

## 10. 待确认项
- 证据不足或需要人工拍板的条目列表
```

## 写作原则

- **可验证**：每条规范尽量附带「依据」（文件路径或配置键），避免空泛口号。
- **不臆造**：仓库没有的工具或命令不要写进「必须」；可写「建议后续引入」。
- **可执行**：命令块中的脚本须与当前 `package.json` scripts 一致。
- **语言**：若用户未指定，默认与用户对话语言一致；技术名词可保留英文。

## 交付方式

- 若用户未指定路径：在对话中输出完整 Markdown，并询问是否需要写入指定文件（如 `CLAUDE.md`）。
- 若用户要求落盘：写入用户指定路径；若将替换现有文件，先说明会与旧版有何合并策略（保留独有章节等）。
