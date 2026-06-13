# Tauri 自动更新 — 模块参考

## 目录结构

### Skill（全局，所有项目共用）

```
~/.cursor/skills/tauri-app-updater/
├── SKILL.md
├── pitfalls.md
├── reference.md
├── templates/
│   ├── release.config.json
│   └── package.json.scripts.snippet
└── scripts/
    ├── init-project.mjs
    ├── release-interactive.mjs
    ├── release.mjs
    ├── generate-latest-json.mjs
    ├── gitcode-upload-release.mjs
    └── lib/
        ├── skill-paths.mjs
        ├── load-release-config.mjs
        ├── project-version.mjs
        └── import-from-project.mjs
```

### 项目（每个 Tauri 应用）

```
project/
├── release.config.json
├── releases/
│   ├── latest.json
│   └── artifacts/
├── scripts/
│   └── updater-skill.mjs    # 由 init-project.mjs 生成，转发到 Skill
├── docs/RELEASE.md          # 可选，项目发版说明
├── src-tauri/
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   ├── capabilities/default.json
│   └── src/app_updater.rs
└── src/lib/app-updater.ts
```

## 接入命令

```bash
# 在项目根目录执行一次
node ~/.cursor/skills/tauri-app-updater/scripts/init-project.mjs
pnpm install
```

## release.config.json 字段

```json
{
  "appName": "Your App",
  "versionBump": "pre",
  "tauriBuildCommand": "pnpm tauri build",
  "signing": {
    "privateKeyPath": "~/.tauri/<app-name>.key",
    "privateKeyPassword": "",
    "envKeyVar": "YOUR_APP_SIGNING_PRIVATE_KEY",
    "envPasswordVar": "YOUR_APP_SIGNING_PRIVATE_KEY_PASSWORD"
  },
  "gitcode": {
    "owner": "<owner>",
    "repo": "<repo>",
    "apiUrl": "https://api.gitcode.com/api/v5",
    "defaultBranch": "master"
  }
}
```

`envKeyVar` / `envPasswordVar` 可选；未设置时默认使用 `TAURI_SIGNING_PRIVATE_KEY`。

## latest.json URL 格式

- **Endpoint**（检查更新）：
  `https://api.gitcode.com/api/v5/repos/{owner}/{repo}/releases/latest/attach_files/latest.json/download`
- **安装包 URL**（platforms 内）：
  `https://api.gitcode.com/api/v5/repos/{owner}/{repo}/releases/v{version}/attach_files/{encodeURIComponent(fileName)}/download`

## Rust 命令注册

```rust
// lib.rs
.manage(app_updater::PendingAppUpdate(Mutex::new(None)))
.invoke_handler(tauri::generate_handler![
    app_updater::check_app_update_cmd,
    app_updater::download_install_app_update_cmd,
])
```

## 前端 Hook 模式

- `useAppUpdater`：phase、checkForUpdate、installUpdate
- `useStartupUpdateCheck`：启动静默检查 + toast
- `app-updater-pending.ts`：跨窗口共享 pending 更新信息

## package.json scripts

由 `init-project.mjs` 自动合并，等价于：

```json
{
  "release": "node scripts/updater-skill.mjs release-interactive.mjs",
  "create:release": "node scripts/updater-skill.mjs release-interactive.mjs",
  "release:cli": "node scripts/updater-skill.mjs release.mjs",
  "release:publish": "node scripts/updater-skill.mjs release.mjs --publish",
  "release:upload": "node scripts/updater-skill.mjs gitcode-upload-release.mjs",
  "release:json": "node scripts/updater-skill.mjs generate-latest-json.mjs"
}
```

## 发版后验证清单

- [ ] `curl` latest.json 返回正确 `version`
- [ ] `platforms.windows-x86_64.url` 可 200 下载
- [ ] `signature` 非空
- [ ] 旧版安装包可检查并下载更新
- [ ] 开发模式 `pnpm tauri dev` 不测试 updater

## CI 示例（非交互）

```yaml
- run: pnpm release:cli --skip-bump --upload --notes "Release ${{ github.ref_name }}"
  env:
    GITCODE_TOKEN: ${{ secrets.GITCODE_TOKEN }}
    RELEASE_BASE_URL: https://api.gitcode.com/api/v5/repos/<owner>/<repo>/releases/${{ github.ref_name }}/attach_files
```

生成 `latest.json` 时：

```yaml
- run: node scripts/updater-skill.mjs generate-latest-json.mjs --version "$VERSION" --bundle-root artifacts
```

## 签名密钥生成

```bash
tauri signer generate -w ~/.tauri/<app-name>.key
tauri signer sign -w ~/.tauri/<app-name>.key -f <file>
# pubkey 内容写入 tauri.conf.json plugins.updater.pubkey
```
