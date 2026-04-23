const DIRECT_ICON_BY_EXTENSION: Record<string, string> = {
  ai: 'ai', csv: 'csv', eps: 'eps', exe: 'exe', html: 'html', htm: 'html',
  keynote: 'keynote', pages: 'pages', pdf: 'pdf', psd: 'psd', rtf: 'rtf',
  txt: 'txt', xml: 'xml', zip: 'zip',
}

const ALIAS_ICON_BY_EXTENSION: Record<string, string> = {
  accdb: 'excel', aac: 'audio', aif: 'audio', aiff: 'audio', app: 'exe',
  avif: 'image', bmp: 'image', bz2: 'zip', c: 'txt', cc: 'txt', conf: 'txt',
  cpp: 'txt', css: 'html', cue: 'audio', dmg: 'exe', doc: 'word', docx: 'word',
  flac: 'audio', gif: 'image', gz: 'zip', heic: 'image', heif: 'image',
  ico: 'image', jpeg: 'image', jpg: 'image', js: 'txt', json: 'txt', m4a: 'audio',
  m4v: 'video', markdown: 'txt', md: 'txt', mkv: 'video', mov: 'video', mp3: 'audio',
  mp4: 'video', numbers: 'excel', ods: 'excel', ogg: 'audio', pkg: 'exe', png: 'image',
  potx: 'ppt', pps: 'ppt', ppsx: 'ppt', ppt: 'ppt', pptx: 'ppt', py: 'txt',
  rar: 'zip', rb: 'txt', rs: 'txt', sh: 'txt', svg: 'image', tar: 'zip', tif: 'image',
  tiff: 'image', toml: 'txt', ts: 'txt', tsx: 'txt', wav: 'audio', webm: 'video',
  webp: 'image', webloc: 'link', xls: 'excel', xlsx: 'excel', xz: 'zip', yaml: 'txt',
  yml: 'txt', '7z': 'zip',
}

export function getFileIconName(paths?: string[]) {
  if (!paths?.length) return 'unknown'
  if (paths.length > 1) return 'attachment'
  const normalized = paths[0].replace(/\\/g, '/')
  if (normalized.endsWith('/')) return 'folder'
  const fileName = normalized.split('/').pop() ?? normalized
  const extension = fileName.includes('.') ? (fileName.split('.').pop()?.toLowerCase() ?? '') : ''
  if (!extension) return 'folder'
  return DIRECT_ICON_BY_EXTENSION[extension] ?? ALIAS_ICON_BY_EXTENSION[extension] ?? 'unknown'
}
