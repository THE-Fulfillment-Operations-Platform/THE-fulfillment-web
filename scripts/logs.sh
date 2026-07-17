#!/usr/bin/env bash
# =============================================================================
# logs.sh — tail log tất cả service (Ctrl-C để thoát).
#   ./scripts/logs.sh            → follow toàn bộ, 200 dòng cuối mỗi service
#   ./scripts/logs.sh backend    → chỉ 1 service
#   TAIL=1000 ./scripts/logs.sh  → đổi số dòng lịch sử
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

TAIL="${TAIL:-200}"
dc logs -f --tail "${TAIL}" "$@"
