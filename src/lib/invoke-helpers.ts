import toast from 'react-hot-toast'

export function getInvokeErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message
    if (typeof m === 'string') return m
  }
  return String(err)
}

/** 在 invoke 失败时提示用户并记录到控制台。 */
export function toastInvokeError(context: string, err: unknown, duration = 4000): void {
  console.error(context, err)
  toast.error(`${context}：${getInvokeErrorMessage(err)}`, { duration })
}
