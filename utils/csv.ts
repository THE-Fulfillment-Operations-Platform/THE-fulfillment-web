// ---------------------------------------------------------------------------
// CSV writer — turn a list of rows into a downloadable CSV. Complements the
// parser below (used by the paste-import flow). Kept dependency-free so any data
// grid can offer an "Export CSV" without a spreadsheet library.
// ---------------------------------------------------------------------------

export interface CsvColumn<T> {
  /** Header text written to the first row. */
  label: string
  /** Cell value; a plain key on the row or a derived getter. */
  value: keyof T | ((row: T) => unknown)
}

function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // CSV-injection guard (CWE-1236): a cell that begins with a formula trigger is
  // prefixed with an apostrophe so spreadsheets treat it as text, not a live
  // formula. Quote-wrapping alone does NOT help — the app strips CSV quoting
  // before evaluating the cell. Data here can originate from seller imports.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  // Quote-wrap when the cell contains a delimiter, quote or newline.
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(',')
  const body = rows.map((row) =>
    columns
      .map((c) =>
        escapeCsvCell(typeof c.value === 'function' ? (c.value as (r: T) => unknown)(row) : row[c.value]),
      )
      .join(','),
  )
  return [header, ...body].join('\r\n')
}

/**
 * Trigger a browser download of a CSV string. Prepends a UTF-8 BOM so Excel
 * opens Vietnamese text without mojibake.
 */
export function downloadCsv(filename: string, csv: string): void {
  const BOM = '﻿'
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Convenience: build the CSV and download it in one call. */
export function exportCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  downloadCsv(filename, toCsv(rows, columns))
}

// Minimal CSV parser supporting quoted fields, escaped quotes and CRLF.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      // skip blank trailing line
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }

  if (!rows.length) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim()
    })
    return obj
  })
}

// Keep in sync with the backend orderImportTemplateHeaders (import_service.go).
// "Design" (single column) is replaced by "Front Design" + "Back Design"; the
// backend still accepts an old "Design" column as the front side for compatibility.
export const IMPORT_COLUMNS = [
  'StoreOrderID',
  'Account',
  'StoreName',
  'ShippingMethod',
  'Quantity',
  'ProductName',
  'VariantCode',
  'SKU',
  'Mã ảnh',
  'Front Design',
  'Back Design',
  'Mockup',
  'EngraveText',
  'ShippingName',
  'ShippingAddress1',
  'ShippingAddress2',
  'ShippingCity',
  'ShippingZip',
  'ShippingProvince',
  'ShippingCountry',
  'ShippingPhone',
  'ShippingEmail',
  'IOSS',
  'Note',
] as const

export function importTemplateCsv(): string {
  const header = IMPORT_COLUMNS.join(',')
  const sample = [
    'Etsy-9001,acc-001,Etsy-Demo,Standard,1,Personalized Wood Sign,VAR-1,WOOD-01,IMG-9001,https://designs.example.com/9001-front.png,,https://mockups.example.com/etsy-9001-1.png,Hello,John Doe,12 Main St,,Austin,73301,TX,US,+1900000000,john@example.com,,First order',
    'Etsy-9001,acc-001,Etsy-Demo,Standard,2,Mica Plate,VAR-2,MICA-02,IMG-9002,https://designs.example.com/9002-front.png,https://designs.example.com/9002-back.png,https://mockups.example.com/etsy-9001-2.png,,John Doe,12 Main St,,Austin,73301,TX,US,+1900000000,john@example.com,,',
  ]
  return [header, ...sample].join('\n')
}
