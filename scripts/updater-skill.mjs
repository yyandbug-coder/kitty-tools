#!/usr/bin/env node
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
