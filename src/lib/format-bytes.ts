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
