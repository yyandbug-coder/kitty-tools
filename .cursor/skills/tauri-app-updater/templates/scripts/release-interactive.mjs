#!/usr/bin/env node
/**
 * Kitty Tools 交互式发版向导（类似 create-vite 脚手架体验）
 *
 * 用法：
 *   pnpm create:release
 *   pnpm release:interactive
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as p from '@clack/prompts'

import { getProjectVersion } from './lib/project-version.mjs'

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const currentVersion = getProjectVersion(projectRoot)
const artifactDir = join(projectRoot, 'releases/artifacts')

function hasArtifacts() {
  if (!existsSync(artifactDir)) return false
  return readdirSync(artifactDir).some((name) => /\.(exe|msi|sig|tar\.gz|AppImage|json)$/i.test(name))
}

function runRelease(args) {
  const command = process.platform === 'win32' ? 'node' : 'node'
  const fullArgs = ['scripts/release.mjs', ...args]
  p.log.step(`执行：node ${fullArgs.join(' ')}`)
  const result = spawnSync(command, fullArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function cancelIfNeeded(value) {
  if (p.isCancel(value)) {
    p.cancel('已取消发版。')
    process.exit(0)
  }
  return value
}

async function main() {
  console.clear()
  p.intro('Kitty Tools 发版向导')

  const action = cancelIfNeeded(
    await p.select({
      message: '选择发版操作',
      options: [
        {
          value: 'build',
          label: '仅打包',
          hint: '本地构建 + 生成 latest.json，不上传',
        },
        {
          value: 'build-upload',
          label: '打包并上传',
          hint: '构建后上传到 GitCode Release',
        },
        {
          value: 'upload-only',
          label: '仅上传已有产物',
          hint: '跳过构建，上传 releases/artifacts/',
        },
        {
          value: 'dry-run',
          label: '预览流程',
          hint: 'dry-run，不实际构建/上传',
        },
      ],
    }),
  )

  /** @type {string[]} */
  const releaseArgs = []

  if (action === 'dry-run') {
    releaseArgs.push('--dry-run')
  }

  if (action === 'upload-only') {
    releaseArgs.push('--skip-build')
    if (!hasArtifacts()) {
      p.log.warn('releases/artifacts/ 为空或不存在，请先执行「仅打包」。')
      const continueAnyway = cancelIfNeeded(
        await p.confirm({
          message: '仍要继续上传吗？',
          initialValue: false,
        }),
      )
      if (!continueAnyway) {
        p.cancel('已取消发版。')
        process.exit(0)
      }
    }
  }

  let targetVersion = currentVersion
  let versionLabel = `保持当前版本 v${currentVersion}`

  const versionStrategy = cancelIfNeeded(
    await p.select({
      message: '版本号策略',
      options: [
        {
          value: 'keep',
          label: `保持当前版本 v${currentVersion}`,
          hint: action === 'upload-only' ? '上传到当前版本 tag' : '适合重打同一版本',
        },
        {
          value: 'set',
          label: '指定版本号',
          hint: '手动输入，例如 0.1.3',
        },
        {
          value: 'patch',
          label: `自动递增 patch → v${bumpPreview(currentVersion, 'patch')}`,
        },
        {
          value: 'minor',
          label: `自动递增 minor → v${bumpPreview(currentVersion, 'minor')}`,
        },
        {
          value: 'major',
          label: `自动递增 major → v${bumpPreview(currentVersion, 'major')}`,
        },
      ],
    }),
  )

  if (versionStrategy === 'keep') {
    releaseArgs.push('--skip-bump')
    versionLabel = `保持当前版本 v${currentVersion}`
    targetVersion = currentVersion
  } else if (versionStrategy === 'set') {
    const inputVersion = cancelIfNeeded(
      await p.text({
        message: '输入目标版本号',
        placeholder: '0.1.3',
        initialValue: currentVersion,
        validate(value) {
          const normalized = String(value).trim().replace(/^v/, '')
          if (!/^\d+\.\d+\.\d+/.test(normalized)) {
            return '请输入有效语义化版本，例如 0.1.3'
          }
        },
      }),
    )
    targetVersion = String(inputVersion).trim().replace(/^v/, '')
    releaseArgs.push('--set-version', targetVersion)
    versionLabel = `指定版本 v${targetVersion}`
  } else {
    releaseArgs.push('--part', versionStrategy)
    targetVersion = bumpPreview(currentVersion, versionStrategy)
    versionLabel = `递增 ${versionStrategy} → v${targetVersion}`
  }

  const defaultNotes =
    action === 'upload-only' ? `Kitty Tools ${targetVersion}` : `Kitty Tools release`
  const notes = cancelIfNeeded(
    await p.text({
      message: '更新说明（Release notes）',
      placeholder: defaultNotes,
      initialValue: defaultNotes,
    }),
  )
  releaseArgs.push('--notes', String(notes).trim() || defaultNotes)

  let upload = action === 'build-upload' || action === 'upload-only'
  let pushTag = false

  if (action === 'build' || action === 'dry-run') {
    upload = false
  }

  if (action === 'build-upload' || action === 'upload-only') {
    if (!process.env.GITCODE_TOKEN) {
      p.log.warn('未检测到环境变量 GITCODE_TOKEN，上传将失败。')
      const continueWithoutToken = cancelIfNeeded(
        await p.confirm({
          message: '是否仍继续（稍后手动设置 Token）？',
          initialValue: false,
        }),
      )
      if (!continueWithoutToken) {
        p.cancel('已取消发版。')
        process.exit(0)
      }
    }

    if (action === 'build-upload') {
      pushTag = cancelIfNeeded(
        await p.confirm({
          message: '是否同时提交代码、打 tag 并 push 到 Git？',
          initialValue: false,
        }),
      )
    }

    releaseArgs.push('--upload')
    if (pushTag) {
      releaseArgs.push('--push')
    }
  }

  const buildLabel =
    action === 'upload-only'
      ? '跳过构建'
      : action === 'dry-run'
        ? '预览（不构建）'
        : '执行 pnpm tauri build'

  const summary = p.note(
    [
      `操作：${actionLabel(action)}`,
      `版本：${versionLabel}`,
      `构建：${buildLabel}`,
      `上传：${upload ? '是（GitCode）' : '否'}`,
      `推送 Git tag：${pushTag ? '是' : '否'}`,
      `说明：${String(notes).trim() || defaultNotes}`,
      '',
      '产物目录：releases/artifacts/',
      '更新清单：releases/latest.json',
    ].join('\n'),
    '发版摘要',
  )

  const confirmed = cancelIfNeeded(
    await p.confirm({
      message: '确认开始执行？',
      initialValue: true,
    }),
  )

  if (!confirmed) {
    p.cancel('已取消发版。')
    process.exit(0)
  }

  p.log.info(summary)
  runRelease(releaseArgs)
  p.outro(`发版完成：v${targetVersion}`)
}

/**
 * @param {string} version
 * @param {'patch' | 'minor' | 'major'} part
 */
function bumpPreview(version, part) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return version
  let major = Number(match[1])
  let minor = Number(match[2])
  let patch = Number(match[3])
  if (part === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (part === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  return `${major}.${minor}.${patch}`
}

/**
 * @param {string} action
 */
function actionLabel(action) {
  switch (action) {
    case 'build':
      return '仅打包'
    case 'build-upload':
      return '打包并上传'
    case 'upload-only':
      return '仅上传已有产物'
    case 'dry-run':
      return '预览流程'
    default:
      return action
  }
}

void main().catch((error) => {
  p.log.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
