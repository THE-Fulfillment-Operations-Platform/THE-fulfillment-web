#!/usr/bin/env bash
# =============================================================================
# stop.sh — dừng stack.
#   Mặc định: `stop` (giữ container + network, khởi động lại nhanh).
#   Cờ --down: `down` (xoá container + network; volume caddy_data VẪN GIỮ).
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

if [[ "${1:-}" == "--down" ]]; then
  echo "==> Down stack (xoá container + network; giữ volume)..."
  dc down
else
  echo "==> Stop stack (giữ container)..."
  dc stop
fi

echo ""
dc ps
