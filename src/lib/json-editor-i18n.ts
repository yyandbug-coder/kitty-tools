import type {
  ContextMenuItem,
  MenuButton,
  MenuDropDownButton,
  MenuItem,
  MenuLabel,
  OnRenderContextMenu,
  OnRenderMenu,
} from 'vanilla-jsoneditor'

/** vanilla-jsoneditor 内置英文文案 → 简体中文 */
const JSON_EDITOR_ZH: Record<string, string> = {
  'Accept the repaired document': '接受修复后的文档',
  Apply: '应用',
  'Apply fixed JSON': '应用修复后的 JSON',
  Array: '数组',
  'Auto repair': '自动修复',
  'Automatically repair JSON': '自动修复 JSON',
  Cancel: '取消',
  'Cancel opening this large document.': '取消打开此大型文档。',
  'Cancel repair': '取消修复',
  'Close this message': '关闭此消息',
  'Collapse all': '全部折叠',
  'Compact JSON: remove all white spacing and new lines (Ctrl+Shift+I)':
    '压缩 JSON：移除所有空白与换行（Ctrl+Shift+I）',
  Copy: '复制',
  'Copy (Ctrl+C)': '复制（Ctrl+C）',
  'Copy compacted': '复制（压缩）',
  'Copy formatted': '复制（格式化）',
  'Copy selected contents, formatted with indentation (Ctrl+C)':
    '复制选中内容（带缩进，Ctrl+C）',
  'Copy selected contents, without indentation (Ctrl+Shift+C)':
    '复制选中内容（无缩进，Ctrl+Shift+C）',
  'Copying and pasting': '复制与粘贴',
  Cut: '剪切',
  'Cut compacted': '剪切（压缩）',
  'Cut formatted': '剪切（格式化）',
  'Cut selected contents, formatted with indentation (Ctrl+X)':
    '剪切选中内容（带缩进，Ctrl+X）',
  'Cut selected contents, without indentation (Ctrl+Shift+X)':
    '剪切选中内容（无缩进，Ctrl+Shift+X）',
  Duplicate: '复制节点',
  'Duplicate row': '复制行',
  'Duplicate selected contents (Ctrl+D)': '复制选中内容（Ctrl+D）',
  'Duplicate the current row (Ctrl+D)': '复制当前行（Ctrl+D）',
  Edit: '编辑',
  'Edit key': '编辑键名',
  'Edit row': '编辑行',
  'Edit the current row': '编辑当前行',
  'Edit the key (Double-click on the key)': '编辑键名（双击键名）',
  'Edit the value (Double-click on the value)': '编辑值（双击值）',
  'Edit value': '编辑值',
  'Enforce keeping the value as string when it contains a numeric value':
    '强制将数值保留为字符串',
  'Enforce string': '强制字符串',
  'Expand all': '全部展开',
  Extract: '提取',
  'Extract selected contents': '提取选中内容',
  Format: '格式化',
  'Format JSON: add proper indentation and new lines (Ctrl+I)':
    '格式化 JSON：添加缩进与换行（Ctrl+I）',
  'Insert a row after the current row': '在当前行后插入',
  'Insert a row before the current row': '在当前行前插入',
  'Insert after': '后插入',
  'Insert before': '前插入',
  'Insert:': '插入：',
  'Convert to:': '转换为：',
  'Keep the JSON embedded in the value': '保留值内嵌的 JSON',
  'Keep the pasted array': '保留粘贴的数组',
  'Keep the pasted content as a single value': '将粘贴内容保留为单个值',
  'Leave as is': '保持原样',
  'Leave the document unchanged and repair it manually instead': '保持文档不变，改为手动修复',
  'Move to the parse error location': '跳转到解析错误位置',
  'No thanks': '不用了',
  Object: '对象',
  Ok: '确定',
  'Open anyway': '仍然打开',
  'Open in tree mode': '以树形模式打开',
  'Open the document in text mode. This may freeze or crash your browser.':
    '以文本模式打开文档，可能导致浏览器卡顿或崩溃。',
  'Open the document in tree mode. Tree mode can handle large documents.':
    '以树形模式打开文档，树形模式可处理较大文档。',
  Paste: '粘贴',
  'Paste as JSON instead': '改为粘贴为 JSON',
  'Paste as string instead': '改为粘贴为字符串',
  'Paste clipboard contents (Ctrl+V)': '粘贴剪贴板内容（Ctrl+V）',
  'Paste the clipboard data as a single string value instead of an array':
    '将剪贴板数据粘贴为单个字符串，而非数组',
  'Paste the text as JSON instead of a single value': '将文本粘贴为 JSON，而非单个值',
  'Redo (Ctrl+Shift+Z)': '重做（Ctrl+Shift+Z）',
  Remove: '删除',
  'Remove current row': '删除当前行',
  'Remove row': '删除行',
  'Remove selected contents (Delete)': '删除选中内容（Delete）',
  'Repair manually': '手动修复',
  'Repair manually instead': '改为手动修复',
  'Replace the value with the pasted JSON': '用粘贴的 JSON 替换当前值',
  'Scroll to the error location': '滚动到错误位置',
  'Search (Ctrl+F)': '搜索（Ctrl+F）',
  'Select area after current entry to insert or paste contents':
    '选中当前项之后区域以插入或粘贴',
  'Select area before current entry to insert or paste contents':
    '选中当前项之前区域以插入或粘贴',
  'Show me': '查看说明',
  Sort: '排序',
  'Sort array or object contents': '对数组或对象内容排序',
  Structure: '结构',
  Transform: '转换',
  'Transform array or object contents (filter, sort, project)':
    '转换数组或对象（筛选、排序、投影）',
  'Transform contents (filter, sort, project)': '转换内容（筛选、排序、投影）',
  'Undo (Ctrl+Z)': '撤销（Ctrl+Z）',
  Value: '值',
  ascending: '升序',
  descending: '降序',
  table: '表格',
  text: '文本',
  tree: '树形',
  'Tip: you can open this context menu via right-click or with Ctrl+Q':
    '提示：右键或 Ctrl+Q 可打开此菜单',
}

const MODE_WORD_ZH: Record<string, string> = {
  tree: '树形',
  text: '文本',
  table: '表格',
}

function translateDynamic(text: string): string {
  const modeSwitch = text.match(/^Switch to (tree|text|table) mode \(current mode: (.*)\)$/)
  if (modeSwitch) {
    const target = MODE_WORD_ZH[modeSwitch[1]] ?? modeSwitch[1]
    const current = modeSwitch[2]
      .split(/\s+/)
      .map((w) => MODE_WORD_ZH[w] ?? w)
      .join(' ')
    return `切换到${target}模式（当前：${current}）`
  }

  if (text.startsWith('Table cell:')) {
    return text.replace('Table cell:', '表格单元格：')
  }
  if (text.startsWith('Table row:')) {
    return text.replace('Table row:', '表格行：')
  }

  return text
}

export function translateJsonEditorLabel(text: string | undefined): string | undefined {
  if (!text) return text
  if (JSON_EDITOR_ZH[text]) return JSON_EDITOR_ZH[text]
  const dynamic = translateDynamic(text)
  if (dynamic !== text) return dynamic
  return text
}

function translateMenuButton(button: MenuButton): MenuButton {
  return {
    ...button,
    text: translateJsonEditorLabel(button.text),
    title: translateJsonEditorLabel(button.title),
  }
}

function translateDropDown(button: MenuDropDownButton): MenuDropDownButton {
  return {
    ...button,
    main: translateMenuButton(button.main),
    items: button.items.map(translateMenuButton),
  }
}

function translateMenuLabel(label: MenuLabel): MenuLabel {
  return {
    ...label,
    text: translateJsonEditorLabel(label.text) ?? label.text,
  }
}

function translateMenuItem(item: MenuItem): MenuItem {
  if (item.type === 'button') return translateMenuButton(item)
  return item
}

function translateContextMenuItem(item: ContextMenuItem): ContextMenuItem {
  if (item.type === 'button') return translateMenuButton(item)
  if (item.type === 'dropdown-button') return translateDropDown(item)
  if (item.type === 'row') {
    return {
      ...item,
      items: item.items.map((child) => {
        if (child.type === 'column') {
          return {
            ...child,
            items: child.items.map((colItem) => {
              if (colItem.type === 'button') return translateMenuButton(colItem)
              if (colItem.type === 'dropdown-button') return translateDropDown(colItem)
              if (colItem.type === 'label') return translateMenuLabel(colItem)
              return colItem
            }),
          }
        }
        if (child.type === 'button') return translateMenuButton(child)
        if (child.type === 'dropdown-button') return translateDropDown(child)
        return child
      }),
    }
  }
  return item
}

export const renderJsonEditorMenuZh: OnRenderMenu = (items) =>
  items.map(translateMenuItem)

export const renderJsonEditorContextMenuZh: OnRenderContextMenu = (items, context) => {
  if (context.readOnly) return false
  return items.map(translateContextMenuItem)
}

/** 注入到 vanilla-jsoneditor 的中文菜单 props */
export const JSON_EDITOR_ZH_PROPS = {
  onRenderMenu: renderJsonEditorMenuZh,
  onRenderContextMenu: renderJsonEditorContextMenuZh,
} as const
