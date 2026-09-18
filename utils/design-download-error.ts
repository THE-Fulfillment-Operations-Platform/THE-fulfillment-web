import { ApiError } from '~/utils/api-error'

// Tải ZIP design mà KHÔNG file nào tải được: backend trả 422 mã
// DESIGN_DOWNLOAD_FAILED, details liệt kê TỪNG link hỏng kèm mã lý do. Câu message
// chỉ đủ cho một toast; danh sách đầy đủ dành cho DesignDownloadErrorDialog.

/** Mã lý do — khớp các hằng assetReason* ở backend (asset_url.go). */
export type DesignLinkFailCode =
  | 'DRIVE_FOLDER'
  | 'GOOGLE_DOC'
  | 'DRIVE_NOT_SHARED'
  | 'WEB_PAGE'
  | 'LINK_GONE'
  | 'LINK_FORBIDDEN'
  | 'HTTP_STATUS'
  | 'TOO_LARGE'
  | 'BAD_URL'
  | 'UNREACHABLE'
  | 'DOWNLOAD_FAILED'

export interface DesignLinkFailure {
  order_id: number
  internal_code: string
  sku: string
  side?: 'FRONT' | 'BACK'
  code: DesignLinkFailCode | string
  reason: string
  url: string
}

export interface DesignDownloadFailure {
  message: string
  failed: DesignLinkFailure[]
}

export const DESIGN_DOWNLOAD_FAILED = 'DESIGN_DOWNLOAD_FAILED'

/** Lỗi "không file nào tải được" kèm danh sách link hỏng; mọi lỗi khác → null. */
export function designDownloadFailure(e: unknown): DesignDownloadFailure | null {
  if (!(e instanceof ApiError) || e.code !== DESIGN_DOWNLOAD_FAILED) return null
  // `?? []`: Go trả slice rỗng thành null.
  const failed = (e.details as { failed?: DesignLinkFailure[] | null } | undefined)?.failed ?? []
  if (!Array.isArray(failed) || failed.length === 0) return null
  return { message: e.message, failed }
}
