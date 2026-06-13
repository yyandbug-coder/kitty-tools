#!/usr/bin/env node
/**
 * Kitty Tools 一键发版：递增版本 → 构建 → 生成 latest.json →（可选）上传 GitCode Release
 *
 * 用法：
 *   pnpm release
 *   pnpm release --part minor --notes "新增启动器"
 *   pnpm release --dry-run
 *   pnpm release --upload
 *   pnpm release --skip-bump --upload
 *   pnpm release --set-version 0.2.0
 *
 * 环境变量：
 *   TAURI_SIGNING_PRIVATE_KEY          更新包签名私钥（路径或内容）
 *   TAURI_SIGNING_PRIVATE_KEY_PASSWORD 私钥密码（可选）
 *   GITCODE_TOKEN                      GitCode Personal Access Token（--upload 时需要）
 *   RELEASE_BASE_URL                   覆盖 latest.json 下载前缀
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bumpProjectVersion } from '../node_modules/tauri-release-utils/scripts/lib/bump-version.mjs'
import { loadReleaseConfig } from '../node_modules/tauri-release-utils/scripts/lib/release-config.mjs'
import { getProjectVersion, setProjectVersion } from './lib/project-version.mjs'

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const releaseCfg = loadReleaseConfig(projectRoot)
const releaseConfigRaw = JSON.parse(readFileSync(join(projectRoot, 'release.config.json'), 'utf-8'))
const gitcodeCfg = releaseConfigRaw.gitcode ?? {}

const args = process.argv.slice(2)

function readArg(name) {
  const index = args.indexOf(name)
  if (index === -1 || index === args.length - 1) return ''
  return args[index + 1]
}

function hasFlag(name) {
  return args.includes(name)
}

function run(command, commandArgs, options = {}) {
  console.log(`\n[release] $ ${command} ${commandArgs.join(' ')}`)
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...(options.env ?? {}) },
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
const shouldUpload = hasFlag('--upload')
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

if (setVersion) {
  const result = setProjectVersion(projectRoot, setVersion, { dryRun })
  console.log(`[release] 版本 ${result.from} → ${result.to}${dryRun ? '（dry-run）' : ''}`)
  version = result.to
} else if (tagFromEnv) {
  const tagVersion = tagFromEnv.replace(/^v/, '')
  const result = setProjectVersion(projectRoot, tagVersion, { dryRun })
  console.log(`[release] 按 tag 同步版本 ${result.from} → ${result.to}${dryRun ? '（dry-run）' : ''}`)
  version = result.to
} else if (!skipBump) {
  const result = bumpProjectVersion(projectRoot, { part, dryRun })
  console.log(`[release] 版本 ${result.from} → ${result.to}${dryRun ? '（dry-run）' : ''}`)
  for (const file of result.files) {
    console.log(`  ${dryRun ? '将更新' : '已更新'}：${file}`)
  }
  version = result.to
} else {
  console.log(`[release] 跳过版本递增，当前版本 ${version}`)
}

const tagName = `v${version}`
const owner = process.env.GITCODE_OWNER || gitcodeCfg.owner || 'yyandbug'
const repo = process.env.GITCODE_REPO || gitcodeCfg.repo || 'kitty-tools'
const releaseBaseUrl =
  process.env.RELEASE_BASE_URL ||
  `https://gitcode.com/${owner}/${repo}/-/releases/download/${tagName}`

if (dryRun) {
  console.log('\n[release] dry-run 完成。将执行：')
  console.log(`  构建：${releaseCfg.tauriBuildCommand}`)
  console.log(`  生成：releases/latest.json（${releaseBaseUrl}）`)
  console.log(`  Tag：${tagName}`)
  if (shouldUpload) {
    console.log(`  上传：GitCode ${owner}/${repo}`)
  }
  process.exit(0)
}

if (!skipBuild) {
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    console.warn('[release] 警告：未设置 TAURI_SIGNING_PRIVATE_KEY，构建产物可能没有 .sig 签名文件')
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

console.log(`\n[release] 下一步：`)
console.log(`  git add .`)
console.log(`  git commit -m "chore: release ${tagName}"`)
console.log(`  git tag ${tagName}`)
console.log(`  git push && git push origin ${tagName}`)

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
