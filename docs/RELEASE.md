# Kitty Tools 发版指南

本文档说明如何打包桌面安装包、生成自动更新清单，以及上传到 GitCode Release。

> Skill 安装：`npx skills add yyandbug-coder/kitty-tools --skill tauri-app-updater -g -y`  
> 全局规范与踩坑：`~/.agents/skills/tauri-app-updater/`  
> 本项目 Skill 索引：`.cursor/skills/tauri-app-updater/`

其他 Tauri 项目安装（两条命令，和别的 skill 一样）：

```bash
npx skills add yyandbug-coder/kitty-tools --skill tauri-app-updater -g -y
node ~/.agents/skills/tauri-app-updater/scripts/init-project.mjs
pnpm install
```

**日常发版必须使用交互式向导**，不要直接 `pnpm tauri build` 作为发版手段。

---

## 快速开始

```bash
pnpm create:release
```

或（等价）：

```bash
pnpm release
```

终端会逐步引导你选择：

1. 发版操作（仅打包 / 打包并上传 / 仅上传 / 预览）
2. 版本号策略（保持当前 / **指定版本** / 自动递增）
3. 更新说明
4. 是否推送 Git tag（上传时可选）
5. 确认摘要后执行

---

## 命令一览

| 命令 | 用途 |
|------|------|
| `pnpm create:release` | 交互式发版（**推荐**） |
| `pnpm release` | 同 `create:release`（日常默认） |
| `pnpm release:cli` | 非交互底层（CI / 脚本） |
| `pnpm release:publish` | `release:cli --publish` |
| `pnpm release:upload` | 仅上传 `releases/artifacts/` |
| `pnpm release:json` | 仅生成 `latest.json` |
| `pnpm release:dry-run` | 预览非交互流程 |
| `pnpm tauri build` | 仅构建，不整理产物（**非发版流程**） |

---

## 前置准备

### 1. 签名私钥（自动更新必需）

构建 NSIS/MSI 安装包时需要签名，否则不会生成 `.sig`，应用内更新会失败。

默认路径：`~/.tauri/kitty-tools.key`

```json
// release.config.json
{
  "signing": {
    "privateKeyPath": "~/.tauri/kitty-tools.key",
    "privateKeyPassword": ""
  }
}
```

```powershell
$env:KITTY_TOOLS_SIGNING_PRIVATE_KEY = "C:\path\to\kitty-tools.key"
$env:KITTY_TOOLS_SIGNING_PRIVATE_KEY_PASSWORD = ""
```

### 2. GitCode Token（上传时需要）

```powershell
$env:GITCODE_TOKEN = "你的Token"
```

```json
// release.config.json
{
  "gitcode": {
    "owner": "yyandbug",
    "repo": "kitty-tools"
  }
}
```

---

## 交互式发版

### 交互流程

```
┌  Kitty Tools 发版向导
│
◇  选择发版操作
│  ● 仅打包 / ○ 打包并上传 / ○ 仅上传 / ○ 预览
│
◇  版本号策略
│  ○ 保持当前版本
│  ● 指定版本号          ← 可输入任意版本如 0.1.3
│  ○ 自动递增 patch/minor/major
│
◇  更新说明 → 确认执行
└  发版完成
```

### 四种发版操作

| 操作 | 构建 | 上传 | 适用场景 |
|------|------|------|----------|
| 仅打包 | ✅ | ❌ | 本地测试安装包 |
| 打包并上传 | ✅ | ✅ | 正式发布给用户 |
| 仅上传已有产物 | ❌ | ✅ | 已 build 过，只补传 |
| 预览流程 | ❌ | ❌ | 查看将执行什么 |

---

## 命令行发版（非交互，`release:cli`）

适合 CI 或脚本化场景：

```bash
pnpm release:cli [options]
```

### 常用参数

| 参数 | 说明 |
|------|------|
| `--skip-bump` | 不修改版本号 |
| `--set-version 0.1.3` | 指定目标版本 |
| `--part patch` | 自动递增 patch |
| `--skip-build` | 跳过构建 |
| `--upload` | 上传到 GitCode |
| `--push` | 提交 + tag + push |
| `--publish` | `--push --upload` |
| `--notes "说明"` | Release 说明 |
| `--dry-run` | 仅预览 |

### 场景示例

```bash
# 仅打包当前版本
pnpm release:cli --skip-bump

# 打包指定版本
pnpm release:cli --set-version 0.1.3

# 打包并上传
$env:GITCODE_TOKEN = "你的Token"
pnpm release:cli --skip-bump --upload --notes "修复更新下载"

# 发新版本
pnpm release:cli --part patch --upload

# 仅上传已有产物
pnpm release:cli --skip-bump --skip-build --upload
```

---

## 产物说明

```
releases/
├── latest.json
└── artifacts/
    ├── Kitty Tools_x.x.x_x64-setup.exe
    ├── Kitty Tools_x.x.x_x64-setup.exe.sig
    └── latest.json

src-tauri/target/release/bundle/nsis/
```

Updater endpoint：

```
https://api.gitcode.com/api/v5/repos/yyandbug/kitty-tools/releases/latest/attach_files/latest.json/download
```

---

## 踩坑速查

完整矩阵见 `~/.agents/skills/tauri-app-updater/pitfalls.md`。

### 上传失败

- 缺少 `GITCODE_TOKEN`
- GitCode 同名附件**不覆盖**（重发前须手动删除旧附件）
- 无 `.sig`（签名私钥缺失）
- `tag 已存在` 时不要 `--push`

### 下载失败

- `error sending request for url`：检查 latest.json URL、native-tls updater、重新上传新包
- 开发模式无法测试更新，须用正式安装包
- pubkey 与签名私钥不匹配
- 旧版客户端须手动安装一次含修复的版本

---

## 重发同一版本

1. GitCode Release 页删除旧 `.exe`、`.sig`、`latest.json`
2. `pnpm create:release` → 打包并上传 → 保持当前版本 或 指定版本号

---

## 发版后验证

```bash
curl -sL "https://api.gitcode.com/api/v5/repos/yyandbug/kitty-tools/releases/latest/attach_files/latest.json/download"
```

应用内：设置 → 关于 → 检查更新 → 下载并安装。

---

## 命令速查表

| 我想… | 交互式 | 命令行 |
|-------|--------|--------|
| 本地打包测试 | `pnpm release` → 仅打包 | `pnpm release:cli --skip-bump` |
| 打包指定版本 | → **指定版本号** | `pnpm release:cli --set-version 0.1.3` |
| 打包并上传 | → 打包并上传 | `pnpm release:cli --skip-bump --upload` |
| 发新版本 | → 自动递增 patch | `pnpm release:cli --part patch --upload` |
| 只上传 | → 仅上传 | `pnpm release:cli --skip-build --upload` |
| 预览 | → 预览流程 | `pnpm release:cli --dry-run` |
