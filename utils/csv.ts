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

export const IMPORT_COLUMNS = [
  'StoreOrderID',
  'StoreName',
  'ShippingMethod',
  'Quantity',
  'ProductName',
  'VariantCode',
  'SKU',
  'Design',
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
    'Etsy-9001,Etsy-Demo,Standard,1,Personalized Wood Sign,VAR-1,WOOD-01,design-a,https://mockups.example.com/etsy-9001-1.png,Hello,John Doe,12 Main St,,Austin,73301,TX,US,+1900000000,john@example.com,,First order',
    'Etsy-9001,Etsy-Demo,Standard,2,Mica Plate,VAR-2,MICA-02,design-b,https://mockups.example.com/etsy-9001-2.png,,John Doe,12 Main St,,Austin,73301,TX,US,+1900000000,john@example.com,,',
  ]
  return [header, ...sample].join('\n')
}
