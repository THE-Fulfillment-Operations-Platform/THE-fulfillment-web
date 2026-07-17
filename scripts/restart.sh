#!/usr/bin/env bash
# =============================================================================
# restart.sh — restart toàn bộ stack (không build lại).
# Truyền tên service để chỉ restart 1 service, ví dụ:  ./scripts/restart.sh backend
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

echo "==> Restart stack${*:+ (service: $*)}..."
dc restart "$@"

echo ""
dc ps
