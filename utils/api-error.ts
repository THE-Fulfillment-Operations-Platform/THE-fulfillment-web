/** Normalised API error thrown by the service layer. */
export class ApiError extends Error {
  code: string
  status: number
  details?: string

  constructor(message: string, code = 'INTERNAL', status = 0, details?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

/** Human-friendly Vietnamese message for an arbitrary thrown error. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Đã xảy ra lỗi không xác định'
}
