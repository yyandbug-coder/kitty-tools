export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—'
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }
  const kb = bytes / 1024
  if (kb < 1024) {
    return `${kb >= 100 ? kb.toFixed(0) : kb.toFixed(1)} KB`
  }
  const mb = kb / 1024
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`
}

export function sumFileByteSizes(sizes: number[] | undefined): number | undefined {
  if (!sizes?.length) {
    return undefined
  }
  const total = sizes.reduce((a, b) => a + (Number.isFinite(b) && b > 0 ? b : 0), 0)
  return total > 0 ? total : undefined
}
