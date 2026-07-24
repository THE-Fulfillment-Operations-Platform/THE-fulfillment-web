#!/usr/bin/env bash
# =============================================================================
# check-dev-port.sh — chặn `npm run dev` nếu port dev đang bị chiếm.
#
# Lý do tồn tại: listhen (bên trong nuxi) KHÔNG fail khi port yêu cầu bận —
# nó im lặng rơi về dải thay thế 3000–3100 và lấy port trống đầu tiên, tức là
# 3000. Hậu quả: `nuxt dev --port 3001` chạy ra localhost:3000 mà chỉ có một
# dòng log [get-port] trôi qua. Script này biến sự cố im lặng đó thành lỗi rõ.
# =============================================================================
set -euo pipefail

PORT="${DEV_PORT:-3001}"

PIDS="$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
[[ -z "${PIDS}" ]] && exit 0

echo "LỖI: port ${PORT} đang bị chiếm — Nuxt sẽ âm thầm chạy sang 3000." >&2
echo "Tiến trình đang giữ port:" >&2
# shellcheck disable=SC2086
ps -o pid,command -p ${PIDS} | tail -n +2 >&2
echo "" >&2
echo "Giải phóng rồi chạy lại:  kill ${PIDS//$'\n'/ }" >&2
exit 1
