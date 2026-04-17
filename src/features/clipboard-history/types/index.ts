export type ClipboardType = 'text' | 'image' | 'file'
export type AppTheme = 'default' | 'ocean' | 'forest' | 'sunset' | 'custom'
export type ColorMode = 'system' | 'light' | 'dark'

export interface ClipboardItem {
  id: string
  type: ClipboardType
  content: string
  contentHash?: string
  imageByteSize?: number
  /** 与 filePaths 一一对应的文件大小（字节）；无法读取时为 0 */
  fileByteSizes?: number[]
  filePaths?: string[]
  imageRgba?: number[]
  imageWidth?: number
  imageHeight?: number
  timestamp: number
  /** 捕获该条复制时的前台应用名（启发式，可能为空或不准确） */
  sourceApp?: string
  /** 来源应用路径，用于在本地解析图标；导入的 JSON 若来自其他机器可能无效 */
  sourceAppPath?: string
  /** 是否收藏；未写入的旧数据视为未收藏 */
  favorited?: boolean
}

export interface AppSettings {
  showPreview: boolean
  pasteOnEnter: boolean
  /** 主窗口失去焦点时自动隐藏（类似呼出式工具）；设置面板打开时不会隐藏 */
  hideWhenUnfocused: boolean
  /** 本地列表最多保留条数；0 表示不限制（新复制顶掉最旧仅在有上限时生效） */
  historyMaxItems: number
  /** 历史保留天数；0 表示永久不过期；否则为 3 / 7 / 14 */
  historyRetentionDays: number
  backgroundOpacity: number
  theme: AppTheme
  customHue: number
  colorMode: ColorMode
  globalShortcut: string
  /** 为 true 时界面文案不可被鼠标拖选（更像工具窗口）；搜索框仍可编辑与选中 */
  disableTextSelection: boolean
}
