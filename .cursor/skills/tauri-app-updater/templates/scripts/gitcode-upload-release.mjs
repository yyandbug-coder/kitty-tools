#!/usr/bin/env node
/**
 * 创建 GitCode Release 并上传产物（供 pnpm release --upload 与 CI 使用）。
 *
 * 用法：
 *   GITCODE_TOKEN=xxx node scripts/gitcode-upload-release.mjs --tag v0.1.1 --dir releases/artifacts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const releaseConfig = JSON.parse(readFileSync(join(projectRoot, 'release.config.json'), 'utf-8'))
const gitcodeCfg = releaseConfig.gitcode ?? {}

const args = process.argv.slice(2)

function readArg(name) {
  const index = args.indexOf(name)
  if (index === -1 || index === args.length - 1) return ''
  return args[index + 1]
}

const tagName = readArg('--tag') || process.env.GITCODE_TAG
const releaseName = readArg('--name') || `Kitty Tools ${tagName}`
const releaseBody = readArg('--body') || `Release ${tagName}`
const assetsDir = resolve(projectRoot, readArg('--dir') || 'releases/artifacts')

const token = process.env.GITCODE_TOKEN
const owner = process.env.GITCODE_OWNER || gitcodeCfg.owner
const repo = process.env.GITCODE_REPO || gitcodeCfg.repo
const apiUrl = process.env.GITCODE_API_URL || gitcodeCfg.apiUrl || 'https://api.gitcode.com/api/v5'

function resolveDefaultBranch() {
  if (process.env.GITCODE_DEFAULT_BRANCH || gitcodeCfg.defaultBranch) {
    return process.env.GITCODE_DEFAULT_BRANCH || gitcodeCfg.defaultBranch
  }
  const result = spawnSync('git', ['branch', '--show-current'], {
    cwd: projectRoot,
    encoding: 'utf-8',
  })
  const branch = result.stdout?.trim()
  return branch || 'master'
}

const defaultBranch = resolveDefaultBranch()
const releaseVersion = tagName?.replace(/^v/, '') ?? ''

if (!token) {
  console.error('[gitcode-upload] 缺少环境变量 GITCODE_TOKEN')
  process.exit(1)
}
if (!tagName) {
  console.error('[gitcode-upload] 缺少 --tag 或 GITCODE_TAG')
  process.exit(1)
}
if (!owner || !repo) {
  console.error('[gitcode-upload] 缺少 GITCODE_OWNER / GITCODE_REPO 或 release.config.json 配置')
  process.exit(1)
}

/**
 * @param {string} method
 * @param {string} path
 * @param {BodyInit | null | undefined} [body]
 * @param {Record<string, string>} [headers]
 */
async function gitcodeRequest(method, path, body, headers = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...headers,
    },
    body,
  })
  const text = await response.text()
  let json = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text }
    }
  }
  return { ok: response.ok, status: response.status, json, text }
}

async function createRelease() {
  const payload = {
    tag_name: tagName,
    name: releaseName,
    body: releaseBody,
    target_commitish: defaultBranch,
  }

  const created = await gitcodeRequest(
    'POST',
    `/repos/${owner}/${repo}/releases`,
    JSON.stringify(payload),
    { 'Content-Type': 'application/json; charset=utf-8' },
  )

  if (created.ok) {
    console.log(`[gitcode-upload] Release 已创建：${tagName}`)
    return
  }

  const existing = await gitcodeRequest('GET', `/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tagName)}`)
  if (existing.ok) {
    console.log(`[gitcode-upload] Release 已存在，继续上传：${tagName}`)
    return
  }

  console.error(`[gitcode-upload] 创建 Release 失败（HTTP ${created.status}）`)
  console.error(created.text)
  process.exit(1)
}

/**
 * @param {string} filePath
 */
async function uploadFile(filePath) {
  const filename = basename(filePath)
  const encoded = encodeURIComponent(filename)
  const uploadInfo = await gitcodeRequest(
    'GET',
    `/repos/${owner}/${repo}/releases/${encodeURIComponent(tagName)}/upload_url?file_name=${encoded}`,
  )

  if (!uploadInfo.ok || !uploadInfo.json?.url) {
    console.error(`[gitcode-upload] 获取上传 URL 失败：${filename}`)
    console.error(uploadInfo.text)
    process.exit(1)
  }

  const uploadUrl = uploadInfo.json.url
  const headers = uploadInfo.json.headers ?? {}
  const fileBuffer = readFileSync(filePath)

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: fileBuffer,
  })

  if (!response.ok) {
    const body = await response.text()
    if (/already exists|已存在/i.test(body)) {
      console.log(`[gitcode-upload] 已存在，跳过：${filename}`)
      return
    }
    console.error(`[gitcode-upload] 上传失败：${filename}（HTTP ${response.status}）`)
    console.error(body)
    process.exit(1)
  }

  console.log(`[gitcode-upload] 已上传：${filename}`)
}

function listAssetFiles() {
  return readdirSync(assetsDir)
    .map((name) => join(assetsDir, name))
    .filter((path) => statSync(path).isFile())
    .filter((path) => {
      const name = basename(path)
      if (name === 'latest.json') return true
      if (!releaseVersion) return true
      return name.includes(releaseVersion)
    })
}

async function main() {
  const files = listAssetFiles()
  if (files.length === 0) {
    console.error(`[gitcode-upload] 目录为空：${assetsDir}`)
    process.exit(1)
  }

  await createRelease()

  const nonJson = files.filter((file) => !/\.json$/i.test(file))
  const jsonFiles = files.filter((file) => /\.json$/i.test(file))

  for (const file of nonJson) {
    await uploadFile(file)
  }
  for (const file of jsonFiles) {
    await uploadFile(file)
  }

  console.log(`[gitcode-upload] 全部上传完成：${tagName}`)
}

void main()
