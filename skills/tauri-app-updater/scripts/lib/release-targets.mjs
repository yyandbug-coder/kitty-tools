/**
 * 解析 GitHub / GitCode 发版目标与下载基址。
 */

/**
 * @param {Record<string, unknown>} releaseConfigRaw
 */
export function getGithubConfig(releaseConfigRaw) {
  const githubCfg = releaseConfigRaw.github ?? {}
  return {
    owner: process.env.GITHUB_OWNER || githubCfg.owner || '',
    repo: process.env.GITHUB_REPO || githubCfg.repo || '',
    apiUrl: process.env.GITHUB_API_URL || githubCfg.apiUrl || 'https://api.github.com',
    defaultBranch: process.env.GITHUB_DEFAULT_BRANCH || githubCfg.defaultBranch || 'master',
  }
}

/**
 * @param {Record<string, unknown>} releaseConfigRaw
 */
export function getGitcodeConfig(releaseConfigRaw) {
  const gitcodeCfg = releaseConfigRaw.gitcode ?? {}
  return {
    owner: process.env.GITCODE_OWNER || gitcodeCfg.owner || '',
    repo: process.env.GITCODE_REPO || gitcodeCfg.repo || '',
    apiUrl: process.env.GITCODE_API_URL || gitcodeCfg.apiUrl || 'https://api.gitcode.com/api/v5',
    defaultBranch: process.env.GITCODE_DEFAULT_BRANCH || gitcodeCfg.defaultBranch || 'master',
  }
}

/**
 * @param {'github' | 'gitcode'} target
 * @param {Record<string, unknown>} releaseConfigRaw
 * @param {string} version
 */
export function resolveReleaseBaseUrl(target, releaseConfigRaw, version) {
  const tagName = version.startsWith('v') ? version : `v${version}`

  if (process.env.RELEASE_BASE_URL && process.env.RELEASE_TARGET === target) {
    return process.env.RELEASE_BASE_URL
  }

  if (target === 'github') {
    const { owner, repo } = getGithubConfig(releaseConfigRaw)
    if (!owner || !repo) {
      throw new Error('[release-targets] release.config.json 缺少 github.owner / github.repo')
    }
    return `https://github.com/${owner}/${repo}/releases/download/${tagName}`
  }

  const { owner, repo } = getGitcodeConfig(releaseConfigRaw)
  if (!owner || !repo) {
    throw new Error('[release-targets] release.config.json 缺少 gitcode.owner / gitcode.repo')
  }
  return `https://api.gitcode.com/api/v5/repos/${owner}/${repo}/releases/${tagName}/attach_files`
}

/**
 * @param {'github' | 'gitcode'} target
 * @param {Record<string, unknown>} releaseConfigRaw
 */
export function resolveLatestJsonEndpoint(target, releaseConfigRaw) {
  if (target === 'github') {
    const { owner, repo } = getGithubConfig(releaseConfigRaw)
    return `https://github.com/${owner}/${repo}/releases/latest/download/latest.json`
  }

  const { owner, repo } = getGitcodeConfig(releaseConfigRaw)
  return `https://api.gitcode.com/api/v5/repos/${owner}/${repo}/releases/latest/attach_files/latest.json/download`
}

/**
 * @param {Record<string, unknown>} releaseConfigRaw
 * @returns {Array<'github' | 'gitcode'>}
 */
export function listConfiguredReleaseTargets(releaseConfigRaw) {
  /** @type {Array<'github' | 'gitcode'>} */
  const targets = []
  const github = getGithubConfig(releaseConfigRaw)
  const gitcode = getGitcodeConfig(releaseConfigRaw)
  if (github.owner && github.repo) targets.push('github')
  if (gitcode.owner && gitcode.repo) targets.push('gitcode')
  return targets
}
