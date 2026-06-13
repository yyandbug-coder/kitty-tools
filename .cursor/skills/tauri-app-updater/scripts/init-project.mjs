#!/usr/bin/env node
/**
 * 将 Skill 发版命令接入当前 Tauri 项目。
 *
 * 用法（在项目根目录）：
 *   node .cursor/skills/tauri-app-updater/scripts/init-project.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { getSkillRoot } from './lib/skill-paths.mjs'

const projectRoot = process.cwd()
const skillRoot = getSkillRoot()

const wrapperPath = join(projectRoot, 'scripts', 'updater-skill.mjs')
const configPath = join(projectRoot, 'release.config.json')
const packagePath = join(projectRoot, 'package.json')

const wrapperSource = `#!/usr/bin/env node
/**
 * 薄封装：将发版命令转发到 tauri-app-updater Skill。
 * 查找顺序：项目 .cursor/skills/ → 全局 ~/.cursor/skills/
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const skillScript = process.argv[2]
if (!skillScript) {
  console.error('[updater-skill] 缺少 skill 脚本名')
  process.exit(1)
}

function findSkillRoot() {
  const candidates = [
    join(process.cwd(), '.cursor/skills/tauri-app-updater'),
    join(homedir(), '.cursor/skills/tauri-app-updater'),
  ]
  for (const root of candidates) {
    if (existsSync(join(root, 'scripts', skillScript))) return root
  }
  return ''
}

const skillRoot = findSkillRoot()
if (!skillRoot) {
  console.error('[updater-skill] 未找到 tauri-app-updater skill')
  console.error('  方案 1：git clone 后项目自带 .cursor/skills/tauri-app-updater/')
  console.error('  方案 2：npx skills add <owner/repo@tauri-app-updater> -g')
  process.exit(1)
}

const scriptPath = join(skillRoot, 'scripts', skillScript)
const result = spawnSync('node', [scriptPath, ...process.argv.slice(3)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
  shell: false,
})
process.exit(result.status ?? 1)
`

const defaultConfig = {
  appName: 'Your App',
  versionBump: 'pre',
  tauriBuildCommand: 'pnpm tauri build',
  signing: {
    privateKeyPath: '~/.tauri/your-app.key',
    privateKeyPassword: '',
    envKeyVar: 'YOUR_APP_SIGNING_PRIVATE_KEY',
    envPasswordVar: 'YOUR_APP_SIGNING_PRIVATE_KEY_PASSWORD',
  },
  gitcode: {
    owner: 'YOUR_GITCODE_OWNER',
    repo: 'YOUR_REPO_NAME',
    apiUrl: 'https://api.gitcode.com/api/v5',
    defaultBranch: 'master',
  },
}

const packageScripts = {
  release: 'node scripts/updater-skill.mjs release-interactive.mjs',
  'release:interactive': 'node scripts/updater-skill.mjs release-interactive.mjs',
  'create:release': 'node scripts/updater-skill.mjs release-interactive.mjs',
  'release:cli': 'node scripts/updater-skill.mjs release.mjs',
  'release:publish': 'node scripts/updater-skill.mjs release.mjs --publish',
  'release:dry-run': 'node scripts/updater-skill.mjs release.mjs --dry-run',
  'release:upload': 'node scripts/updater-skill.mjs gitcode-upload-release.mjs',
  'release:json': 'node scripts/updater-skill.mjs generate-latest-json.mjs',
}

mkdirSync(join(projectRoot, 'scripts'), { recursive: true })
writeFileSync(wrapperPath, wrapperSource, 'utf8')
console.log(`[init] 已写入 ${wrapperPath}`)

if (!existsSync(configPath)) {
  writeFileSync(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`, 'utf8')
  console.log(`[init] 已写入 ${configPath}（请修改 owner/repo/私钥路径）`)
} else {
  console.log(`[init] 保留已有 ${configPath}`)
}

if (!existsSync(packagePath)) {
  console.error('[init] 未找到 package.json，请在项目根目录执行')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))
pkg.scripts = { ...pkg.scripts, ...packageScripts }

const devDeps = pkg.devDependencies ?? {}
if (!devDeps['@clack/prompts']) devDeps['@clack/prompts'] = '^1.5.1'
if (!devDeps['tauri-release-utils']) devDeps['tauri-release-utils'] = '^0.1.1'
pkg.devDependencies = devDeps

writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
console.log('[init] 已合并 package.json scripts')
console.log(`[init] Skill 路径：${skillRoot}`)
console.log('\n下一步：')
console.log('  1. 编辑 release.config.json')
console.log('  2. pnpm install')
console.log('  3. pnpm create:release')
