// normalizeCode canonicalises a user-entered "mã" so it is ALWAYS uppercase,
// free of Vietnamese diacritics, and free of spaces — mirroring the backend
// models.NormalizeCode (the server enforces this too; this is for live UX).
// e.g. "Mica Trọng 3 Ly" -> "MICA-TRONG-3-LY", "Gỗ" -> "GO".
export function normalizeCode(input: string): string {
  return (input || '')
    .trim()
    .normalize('NFD') // decompose accented letters
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[đĐ]/g, 'D') // đ / Đ -> D (they don't decompose)
    .toUpperCase()
    .replace(/\s+/g, '-') // whitespace -> hyphen
    .replace(/[^A-Z0-9\-_.]/g, '') // drop anything else
    .replace(/-{2,}/g, '-') // collapse repeated hyphens
    .replace(/^-+|-+$/g, '') // trim edge hyphens
}
