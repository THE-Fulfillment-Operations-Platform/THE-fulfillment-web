#!/usr/bin/env node
// Chạy bài tự kiểm mã batch màn Đơn hàng (tests/batchCode.selftest.ts): gói bằng
// esbuild như test:diecut / test:date-range rồi chạy trên node.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'batch-code-'))
const out = join(dir, 'selftest.mjs')
try {
  execFileSync('./node_modules/.bin/esbuild', [
    'tests/batchCode.selftest.ts', '--bundle', '--platform=node', '--format=esm',
    `--outfile=${out}`, '--log-level=warning',
  ], { stdio: 'inherit' })
  execFileSync('node', [out], { stdio: 'inherit' })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
