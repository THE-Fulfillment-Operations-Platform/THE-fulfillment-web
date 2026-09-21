// Đóng gói bộ file giao xưởng.
//
// Quy ước tên file cố định và có nghĩa với người ở xưởng (IN / CAT / XEM-TRUOC),
// kèm một file thông số đọc được bằng mắt. Mỗi gói tự nói được: khổ bao nhiêu,
// viền mấy mm, in ở DPI nào, máy đã kiểm những gì — để không ai phải đoán khi
// file nằm trên máy tính khác sau ba tuần.

import { zipSync, type Zippable } from 'fflate'
import { buildDxf, verifyDxf } from './dxf'
import { buildCutSvg } from './svg'
import { canvasToBytes, renderPreviewCanvas, renderPrintCanvas } from './render'
import type { Analysis, DiecutGeometry, DiecutSettings } from './pipeline'

export const CUT_LAYER = 'CAT'
export const HOLE_LAYER = 'LO_TREO'

export interface DiecutJob {
  name: string
  source: HTMLCanvasElement
  analysis: Analysis
  geometry: DiecutGeometry
  settings: DiecutSettings
}

export interface PackagedFile {
  path: string
  bytes: Uint8Array
}

/** Bỏ dấu tiếng Việt và ký tự lạ — tên file phải sống sót qua Windows, máy laser và email. */
export function safeName(input: string): string {
  const base = input.replace(/\.[^.]+$/, '')
  return (
    base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'thiet-ke'
  )
}

function formatNow(): string {
  const d = new Date()
  const p = (v: number) => String(v).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function specText(job: DiecutJob, dxfProblems: string[]): string {
  const { geometry: g, settings: s } = job
  const lines = [
    `BỘ FILE IN + CẮT — ${job.name}`,
    `Sinh lúc: ${formatNow()} bằng công cụ Thiết kế (BGDecor Fulfillment)`,
    '',
    'KÍCH THƯỚC (đơn vị mm, tỷ lệ 1:1)',
    `  Thành phẩm sau cắt : ${g.widthMm.toFixed(1)} × ${g.heightMm.toFixed(1)} mm`,
    `  Phần hình in       : ${g.artwork.widthMm.toFixed(1)} × ${g.artwork.heightMm.toFixed(1)} mm`,
    `  Viền cắt quanh hình: ${s.offsetMm} mm`,
    `  Tràn lề in (bleed) : ${s.bleedMm} mm`,
    g.hole
      ? `  Lỗ treo            : Ø${(g.hole.rMm * 2).toFixed(1)} mm, tâm cách mép trên ${g.hole.cyMm.toFixed(1)} mm, cách mép trái ${g.hole.cxMm.toFixed(1)} mm, hở tới mép cắt ${g.hole.clearanceMm.toFixed(1)} mm`
      : '  Lỗ treo            : không có',
    '',
    'FILE TRONG GÓI',
    `  *_IN.png         — file in, ${s.printDpi} DPI, nền trong suốt`,
    `  *_CAT.dxf        — file cắt, DXF R12, lớp ${CUT_LAYER}${g.hole ? ` và ${HOLE_LAYER}` : ''}`,
    '  *_CAT.svg        — file cắt bản SVG, mở bằng Corel/Illustrator',
    '  *_XEM-TRUOC.png  — ảnh chồng đường cắt lên hình in để soi bằng mắt',
    '',
    'LƯU Ý KHI DÙNG',
    '  • File in và file cắt chung một gốc toạ độ và cùng khổ → chồng lên nhau là khớp.',
    '  • Mở file bằng đơn vị mm, tỷ lệ 1:1. KHÔNG dùng lệnh scale-to-fit khi in hay khi cắt.',
    '  • Đường cắt nằm trên lớp riêng; mạch cắt (kerf) của máy chưa được bù trong file này.',
    '',
    'MÁY ĐÃ KIỂM',
    `  Số đường cắt: ${g.stats.ringCount} · số điểm: ${g.stats.pointCount} · chu vi: ${g.stats.perimeterMm.toFixed(0)} mm`,
    `  Độ nét ảnh in ở khổ này: ${Math.round(g.stats.dpi)} DPI`,
    `  Đọc ngược DXF: ${dxfProblems.length ? 'CÓ VẤN ĐỀ → ' + dxfProblems.join('; ') : 'khớp số đường, số lỗ và khổ'}`,
  ]
  if (g.warnings.length) {
    lines.push('', 'CẢNH BÁO')
    for (const w of g.warnings) lines.push(`  ⚠ ${w}`)
  }
  if (g.notes.length) {
    lines.push('', 'GHI CHÚ')
    for (const n of g.notes) lines.push(`  · ${n}`)
  }
  lines.push(
    '',
    'Gói này là file sản xuất, CHƯA phải bản đã cắt thử. Sản phẩm mới nên cắt 1 mẫu kiểm trước khi chạy cả loạt.',
    '',
  )
  return lines.join('\r\n')
}

/** Dựng toàn bộ file của một sản phẩm. */
export async function buildFiles(job: DiecutJob): Promise<PackagedFile[]> {
  const { geometry: g, settings: s } = job
  const base = safeName(job.name)

  const circles = g.hole
    ? [{ cx: g.hole.cxMm, cy: g.hole.cyMm, r: g.hole.rMm, layer: HOLE_LAYER }]
    : []
  const dxf = buildDxf({
    rings: g.rings,
    circles,
    widthMm: g.widthMm,
    heightMm: g.heightMm,
    layer: CUT_LAYER,
  })
  // Đọc ngược file vừa ghi — luật cũ từ các bộ DXF gửi xưởng: file sai cấu trúc
  // trông vẫn "có vẻ ổn" cho tới lúc máy mở ra trống trơn.
  const dxfProblems = verifyDxf(dxf, {
    rings: g.rings.length,
    circles: circles.length,
    widthMm: g.widthMm,
    heightMm: g.heightMm,
  })

  const svg = buildCutSvg({
    rings: g.rings,
    hole: g.hole ?? undefined,
    widthMm: g.widthMm,
    heightMm: g.heightMm,
    title: `${base} — đường cắt`,
  })

  const print = renderPrintCanvas(job.source, job.analysis, g, s)
  const caption = `${base} · ${g.widthMm.toFixed(1)}×${g.heightMm.toFixed(1)} mm · viền ${s.offsetMm} mm · ${s.printDpi} DPI`
  const preview = renderPreviewCanvas(print, g, caption)

  const enc = new TextEncoder()
  return [
    { path: `${base}_IN.png`, bytes: await canvasToBytes(print) },
    { path: `${base}_CAT.dxf`, bytes: enc.encode(dxf) },
    { path: `${base}_CAT.svg`, bytes: enc.encode(svg) },
    { path: `${base}_XEM-TRUOC.png`, bytes: await canvasToBytes(preview) },
    { path: 'THONG-SO.txt', bytes: enc.encode(specText(job, dxfProblems)) },
  ]
}

/**
 * Gói ZIP. Một sản phẩm thì để file phẳng; nhiều sản phẩm thì mỗi sản phẩm một
 * thư mục — giải nén ra là nhìn thấy ngay từng bộ, không lẫn.
 */
export async function buildZip(jobs: DiecutJob[]): Promise<Blob> {
  const entries: Zippable = {}
  const multi = jobs.length > 1
  const used = new Set<string>()
  for (const job of jobs) {
    let folder = safeName(job.name)
    if (multi) {
      let n = 2
      while (used.has(folder)) folder = `${safeName(job.name)}-${n++}`
      used.add(folder)
    }
    for (const f of await buildFiles(job)) {
      const path = multi ? `${folder}/${f.path}` : f.path
      // PNG đã nén sẵn, nén lại chỉ tốn thời gian; file chữ thì nén tốt.
      entries[path] = [f.bytes, { level: f.path.endsWith('.png') ? 0 : 6 }]
    }
  }
  return new Blob([zipSync(entries)], { type: 'application/zip' })
}

/**
 * Uint8Array → Blob. Ép kiểu vì bản khai báo DOM của TypeScript đang dùng chưa
 * coi Uint8Array<ArrayBufferLike> là BlobPart; chạy thật thì đúng, và ép kiểu
 * còn hơn sao chép cả mảng chục MB chỉ để làm vừa lòng trình kiểm kiểu.
 */
export function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as unknown as BlobPart], { type })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Nhả bộ nhớ sau khi trình duyệt kịp bắt đầu tải.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
