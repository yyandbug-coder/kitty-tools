/**
 * 文本读剪贴板：优先 navigator.clipboard.readText，失败时回落后端 arboard。
 */
import { invoke } from '@tauri-apps/api/core'

export async function readTextFromClipboard(): Promise<string> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return invoke<string>('read_text_from_clipboard')
  }
}
