#!/usr/bin/env node
/**
 * Kitty Tools 一键发版：递增版本 → 构建 → 生成 latest.json →（可选）上传 GitCode Release
 *
 * 用法：
 *   pnpm release
 *   pnpm release --part minor --notes "新增启动器"
 *   pnpm release --dry-run
 *   pnpm release --upload
 *   pnpm release --push
 *   pnpm release:publish
 *   pnpm release --skip-bump --upload
 *   pnpm release --set-version 0.2.0
 *
 * 环境变量：
 *   KITTY_TOOLS_SIGNING_PRIVATE_KEY          本项目签名私钥（路径或内容，优先于 release.config.json）
 *   KITTY_TOOLS_SIGNING_PRIVATE_KEY_PASSWORD 本项目私钥密码（Kitty Tools 密钥默认无密码）
 *   GITCODE_TOKEN                            GitCode Personal Access Token（--upload 时需要）
 *   RELEASE_BASE_URL                         覆盖 latest.json 下载前缀
 *
 * 注意：不会读取全局 TAURI_SIGNING_PRIVATE_KEY_PASSWORD，避免与其他 Tauri 应用冲突。
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bumpProjectVersion } from '../node_modules/tauri-release-utils/scripts/lib/bump-version.mjs'
import { loadReleaseConfig } from '../node_modules/tauri-release-utils/scripts/lib/release-config.mjs'
import { getProjectVersion, setProjectVersion } from './lib/project-version.mjs'

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const releaseCfg = loadReleaseConfig(projectRoot)
const releaseConfigRaw = JSON.parse(readFileSync(join(projectRoot, 'release.config.json'), 'utf-8'))
const gitcodeCfg = releaseConfigRaw.gitcode ?? {}
const signingCfg = releaseConfigRaw.signing ?? {}

const args = process.argv.slice(2)

function resolveSigningPrivateKeyPath() {
  if (process.env.KITTY_TOOLS_SIGNING_PRIVATE_KEY) {
    return process.env.KITTY_TOOLS_SIGNING_PRIVATE_KEY
  }
  const configured = signingCfg.privateKeyPath
  if (configured) {
    if (configured.startsWith('~')) {
      const home = process.env.USERPROFILE || process.env.HOME || ''
      return join(home, configured.slice(2).replace(/^[\\/]/, ''))
    }
    return resolve(projectRoot, configured)
  }
  const home = process.env.USERPROFILE || process.env.HOME || ''
  return join(home, '.tauri', 'kitty-tools.key')
}

/** 构建子进程环境：仅注入 Kitty Tools 签名配置，不继承其他应用的 Tauri 签名变量。 */
function createBuildEnv(extraEnv = {}) {
  const password =
    process.env.KITTY_TOOLS_SIGNING_PRIVATE_KEY_PASSWORD ?? signingCfg.privateKeyPassword ?? ''
  return {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: resolveSigningPrivateKeyPath(),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password,
    ...extraEnv,
  }
}

function readArg(name) {
  const index = args.indexOf(name)
  if (index === -1 || index === args.length - 1) return ''
  return args[index + 1]
}

function hasFlag(name) {
  return args.includes(name)
}

/** Windows 下仅对 pnpm/npm 等脚本命令启用 shell；git 必须禁用 shell，否则 -m 含空格会被拆成多个参数。 */
function shouldUseShell(command, override) {
  if (override !== undefined) return override
  if (process.platform !== 'win32') return false
  return ['pnpm', 'npm', 'npx', 'yarn'].includes(command)
}

function run(command, commandArgs, options = {}) {
  console.log(`\n[release] $ ${command} ${commandArgs.join(' ')}`)
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: shouldUseShell(command, options.shell),
    env: createBuildEnv(options.env ?? {}),
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function collectBundleFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      collectBundleFiles(fullPath, acc)
      continue
    }
    if (/\.(exe|msi|sig|tar\.gz|AppImage)$/i.test(entry)) {
      acc.push(fullPath)
    }
  }
  return acc
}

const dryRun = hasFlag('--dry-run')
const skipBump = hasFlag('--skip-bump')
const skipBuild = hasFlag('--skip-build')
const shouldPublish = hasFlag('--publish')
const shouldPush = hasFlag('--push') || shouldPublish
const shouldUpload = hasFlag('--upload') || shouldPublish
const partArg = readArg('--part') || process.env.TAURI_DMG_VERSION_BUMP_PART || 'patch'
const notes = readArg('--notes') || `Kitty Tools release`
const setVersion = readArg('--set-version')
const tagFromEnv = process.env.GITCODE_TAG || readArg('--tag')

if (!['patch', 'minor', 'major'].includes(partArg)) {
  console.error('[release] --part 必须是 patch、minor 或 major')
  process.exit(1)
}

/** @type {'patch' | 'minor' | 'major'} */
const part = /** @type {'patch' | 'minor' | 'major'} */ (partArg)

let version = getProjectVersion(projectRoot)
/** @type {string[]} */
let versionFiles = []

if (setVersion) {
  const result = setProjectVersion(projectRoot, setVersion, { dryRun })
  console.log(`[release] 版本 ${result.from} → ${result.to}${dryRun ? '（dry-run）' : ''}`)
  version = result.to
  versionFiles = result.files
} else if (tagFromEnv) {
  const tagVersion = tagFromEnv.replace(/^v/, '')
  const result = setProjectVersion(projectRoot, tagVersion, { dryRun })
  console.log(`[release] 按 tag 同步版本 ${result.from} → ${result.to}${dryRun ? '（dry-run）' : ''}`)
  version = result.to
  versionFiles = result.files
} else if (!skipBump) {
  const result = bumpProjectVersion(projectRoot, { part, dryRun })
  console.log(`[release] 版本 ${result.from} → ${result.to}${dryRun ? '（dry-run）' : ''}`)
  for (const file of result.files) {
    console.log(`  ${dryRun ? '将更新' : '已更新'}：${file}`)
  }
  version = result.to
  versionFiles = result.files
} else {
  console.log(`[release] 跳过版本递增，当前版本 ${version}`)
}

const tagName = `v${version}`
const owner = process.env.GITCODE_OWNER || gitcodeCfg.owner || 'yyandbug'
const repo = process.env.GITCODE_REPO || gitcodeCfg.repo || 'kitty-tools'
const releaseBaseUrl =
  process.env.RELEASE_BASE_URL ||
  `https://api.gitcode.com/api/v5/repos/${owner}/${repo}/releases/${tagName}/attach_files`

if (dryRun) {
  console.log('\n[release] dry-run 完成。将执行：')
  console.log(`  构建：${releaseCfg.tauriBuildCommand}`)
  console.log(`  生成：releases/latest.json（${releaseBaseUrl}）`)
  console.log(`  Tag：${tagName}`)
  if (shouldPush) {
    console.log(`  Git：commit + tag ${tagName} + push`)
  }
  if (shouldUpload) {
    console.log(`  上传：GitCode ${owner}/${repo}`)
  }
  process.exit(0)
}

function toRepoRelativePath(absPath) {
  return relative(projectRoot, absPath).replace(/\\/g, '/')
}

function gitPushRelease(tag, commitFiles) {
  const tagCheck = spawnSync('git', ['rev-parse', tag], {
    cwd: projectRoot,
    encoding: 'utf-8',
    shell: false,
  })
  if (tagCheck.status === 0) {
    console.error(`[release] tag ${tag} 已存在，请先删除或更换版本号`)
    process.exit(1)
  }

  const filesToAdd = [
    ...new Set([
      ...commitFiles.map((file) => toRepoRelativePath(file)),
      'releases/latest.json',
    ]),
  ]

  run('git', ['add', '--', ...filesToAdd])

  const staged = spawnSync('git', ['diff', '--cached', '--quiet'], {
    cwd: projectRoot,
    shell: false,
  })
  if (staged.status !== 0) {
    run('git', ['commit', '-m', `chore: release ${tag}`])
  } else {
    console.log('[release] 无待提交变更，跳过 commit')
  }

  run('git', ['tag', tag])
  run('git', ['push'])
  run('git', ['push', 'origin', tag])
  console.log(`\n[release] 已推送 ${tag} 到远程仓库`)
}

if (!skipBuild) {
  const signingKeyPath = resolveSigningPrivateKeyPath()
  if (!existsSync(signingKeyPath) && !process.env.KITTY_TOOLS_SIGNING_PRIVATE_KEY?.includes('BEGIN')) {
    console.warn(`[release] 警告：未找到签名私钥 ${signingKeyPath}，构建产物可能没有 .sig 文件`)
  }
  const buildCmd = releaseCfg.tauriBuildCommand
  const [buildBin, ...buildArgs] = buildCmd.split(/\s+/)
  run(buildBin, buildArgs)
}

const bundleRoot = join(projectRoot, 'src-tauri/target/release/bundle')
const artifactDir = join(projectRoot, 'releases/artifacts')
mkdirSync(artifactDir, { recursive: true })

for (const file of collectBundleFiles(bundleRoot)) {
  cpSync(file, join(artifactDir, basename(file)), { force: true })
}

run('node', [
  'scripts/generate-latest-json.mjs',
  '--version',
  version,
  '--notes',
  notes,
  '--bundle-root',
  bundleRoot,
], {
  env: { RELEASE_BASE_URL: releaseBaseUrl },
})

cpSync(join(projectRoot, 'releases/latest.json'), join(artifactDir, 'latest.json'), { force: true })

console.log('\n[release] 发版本地产物：')
for (const file of readdirSync(artifactDir)) {
  console.log(`  releases/artifacts/${file}`)
}

if (shouldPush) {
  gitPushRelease(tagName, versionFiles)
} else {
  console.log(`\n[release] 下一步：`)
  console.log(`  pnpm release:publish   # 或 pnpm release --push --upload`)
  console.log(`  git add . && git commit -m "chore: release ${tagName}"`)
  console.log(`  git tag ${tagName} && git push && git push origin ${tagName}`)
}

if (shouldUpload) {
  if (!process.env.GITCODE_TOKEN) {
    console.error('\n[release] --upload 需要设置环境变量 GITCODE_TOKEN')
    process.exit(1)
  }
  run('node', [
    'scripts/gitcode-upload-release.mjs',
    '--tag',
    tagName,
    '--name',
    `Kitty Tools ${tagName}`,
    '--body',
    notes,
    '--dir',
    'releases/artifacts',
  ])
  console.log(`\n[release] 已上传到 GitCode Release：${tagName}`)
}

console.log(`\n[release] 完成：${tagName}`)
