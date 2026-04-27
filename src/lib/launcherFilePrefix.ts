/**
 * 与后端 `try_parse_file_command` 一致：首词为 `find` 或 `open` 且后跟空白（或整词为 find/open）时，走仅文件搜索，不做「先快后全」拆分。
 */
export function isFindOrOpenFileCommandQuery(q: string): boolean {
  const t = q.trim()
  if (t.length < 4) {
    return false
  }
  const head4 = t.slice(0, 4).toLowerCase()
  if (head4 === 'find' || head4 === 'open') {
    if (t.length === 4) {
      return true
    }
    const c = t[4]
    return c === ' ' || c === '\t'
  }
  return false
}
