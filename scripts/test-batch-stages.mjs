#!/usr/bin/env node
// Chạy bài tự kiểm chặng batch của Bảng sản xuất (tests/batchStages.selftest.ts): gói bằng
// esbuild như test:diecut / test:date-range rồi chạy trên node.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'batch-stages-'))
const out = join(dir, 'selftest.mjs')
try {
  execFileSync('./node_modules/.bin/esbuild', [
    'tests/batchStages.selftest.ts', '--bundle', '--platform=node', '--format=esm',
    `--outfile=${out}`, '--log-level=warning',
  ], { stdio: 'inherit' })
  for (const tz of ['Asia/Ho_Chi_Minh', 'UTC', 'America/Los_Angeles']) {
    execFileSync('node', [out], { stdio: 'inherit', env: { ...process.env, TZ: tz } })
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
