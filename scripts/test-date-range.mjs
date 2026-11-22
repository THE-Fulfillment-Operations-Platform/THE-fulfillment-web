#!/usr/bin/env node
// Chạy bài tự kiểm mốc lọc khoảng ngày (tests/dateRange.selftest.ts) dưới nhiều
// múi giờ: Asia/Ho_Chi_Minh (máy người dùng), UTC (máy chủ/CI) và
// America/Los_Angeles (có đổi giờ mùa hè). Gói bằng esbuild như test:diecut.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'date-range-'))
const out = join(dir, 'selftest.mjs')
let failed = false
try {
  execFileSync('./node_modules/.bin/esbuild', [
    'tests/dateRange.selftest.ts', '--bundle', '--platform=node', '--format=esm',
    `--outfile=${out}`, '--log-level=warning',
  ], { stdio: 'inherit' })
  for (const tz of ['Asia/Ho_Chi_Minh', 'UTC', 'America/Los_Angeles']) {
    try {
      execFileSync('node', [out], { stdio: 'inherit', env: { ...process.env, TZ: tz } })
    } catch {
      failed = true
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
