/**
 * 文本写剪贴板：先走浏览器 navigator.clipboard.writeText（快、无 IPC），
 * 失焦/无权限时回落到后端 `write_text_to_clipboard`（走 OS 原生 arboard）。
 *
 * 任意一条路径成功即视为成功；两条都失败时 throw 最后一次错误，调用方决定是否提示。
 */
import { invoke } from '@tauri-apps/api/core'

export async function copyTextWithFallback(text: string): Promise<void> {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch (webErr) {
    try {
      await invoke('write_text_to_clipboard', { text })
      return
    } catch (nativeErr) {
      // 浏览器路径常因失焦/权限被拒，是否提示交给调用方；这里抛后端错误更具诊断价值。
      throw nativeErr ?? webErr
    }
  }
}
