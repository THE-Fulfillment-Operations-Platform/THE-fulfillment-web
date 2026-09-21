#!/usr/bin/env node
// Chạy bài tự kiểm của lõi die-cut: gói bằng esbuild (đã có sẵn theo vite) rồi
// chạy trên node. Không kéo thêm bộ khung test nào — lõi này là hàm thuần, chỉ
// cần chạy được và so số.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'diecut-'))
const out = join(dir, 'selftest.mjs')
try {
  execFileSync('./node_modules/.bin/esbuild', [
    'utils/diecut/selftest.ts', '--bundle', '--platform=node', '--format=esm',
    `--outfile=${out}`, '--log-level=warning',
  ], { stdio: 'inherit' })
  execFileSync('node', [out], { stdio: 'inherit' })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
