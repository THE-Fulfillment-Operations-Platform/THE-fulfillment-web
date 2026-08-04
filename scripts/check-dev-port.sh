#!/usr/bin/env bash
# =============================================================================
# check-dev-port.sh — dọn port dev trước khi `npm run dev` chạy.
#
# Lý do tồn tại: listhen (bên trong nuxi) KHÔNG fail khi port yêu cầu bận —
# nó im lặng rơi về dải thay thế 3000–3100 và lấy port trống đầu tiên, tức là
# 3000. Hậu quả: `nuxt dev --port 3001` chạy ra localhost:3000 mà chỉ có một
# dòng log [get-port] trôi qua. Script này biến sự cố im lặng đó thành hành
# động rõ ràng.
#
# Kẻ chiếm port gần như luôn là dev server cũ CỦA CHÍNH REPO NÀY (tab terminal
# quên tắt, tiến trình nền còn sót). Bắt người dùng copy-paste `kill <pid>` cho
# đúng cái mình vừa sinh ra là thừa một bước — script tự thu dọn.
#
# Ranh giới an toàn: chỉ tự kill tiến trình nuxt/node chạy TỪ thư mục repo này.
# Bất cứ thứ gì khác đang nghe port (app khác, docker, đồng nghiệp) vẫn là lỗi
# cứng — không tự ý giết tiến trình không phải của mình.
#
# Đặt DEV_PORT_KEEP=1 để quay lại hành vi cũ (chỉ báo lỗi, không kill).
# =============================================================================
set -euo pipefail

PORT="${DEV_PORT:-3001}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

listeners() { lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true; }

PIDS="$(listeners)"
[[ -z "${PIDS}" ]] && exit 0

# Của repo này hay của người khác? Phân loại trước khi động vào bất cứ pid nào.
MINE=()
FOREIGN=()
for pid in ${PIDS}; do
  cmd="$(ps -o command= -p "${pid}" 2>/dev/null || true)"
  if [[ "${cmd}" == *"${ROOT}"* && "${cmd}" == *nuxt* ]]; then
    MINE+=("${pid}")
  else
    FOREIGN+=("${pid}")
  fi
done

fail() {
  echo "LỖI: port ${PORT} đang bị chiếm — Nuxt sẽ âm thầm chạy sang 3000." >&2
  echo "Tiến trình đang giữ port:" >&2
  # shellcheck disable=SC2086
  ps -o pid,command -p ${PIDS} | tail -n +2 >&2
  echo "" >&2
  echo "Giải phóng rồi chạy lại:  kill ${PIDS//$'\n'/ }" >&2
  exit 1
}

# Có tiến trình lạ, hoặc người dùng đã tắt tính năng tự dọn → giữ nguyên lỗi cũ.
[[ ${#FOREIGN[@]} -gt 0 ]] && fail
[[ -n "${DEV_PORT_KEEP:-}" ]] && fail

echo "Port ${PORT} đang bị dev server cũ của repo này giữ (pid ${MINE[*]}) — đang tắt…" >&2
kill "${MINE[@]}" 2>/dev/null || true

# SIGTERM đủ cho nuxt trong mọi trường hợp bình thường; vòng chờ này là để
# không bàn giao một port "vừa mới còn bận" cho nuxi.
for _ in $(seq 1 20); do
  [[ -z "$(listeners)" ]] && break
  sleep 0.25
done

# Không chết hẳn thì nện SIGKILL, rồi chờ thêm một nhịp.
if [[ -n "$(listeners)" ]]; then
  kill -9 "${MINE[@]}" 2>/dev/null || true
  for _ in $(seq 1 12); do
    [[ -z "$(listeners)" ]] && break
    sleep 0.25
  done
fi

# Vẫn còn ai đó nghe port → báo lỗi thật, đừng để nuxt lặng lẽ nhảy sang 3000.
PIDS="$(listeners)"
[[ -n "${PIDS}" ]] && fail

echo "Đã giải phóng port ${PORT}." >&2
exit 0
