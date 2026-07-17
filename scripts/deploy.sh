#!/usr/bin/env bash
# =============================================================================
# deploy.sh — build lại & khởi động toàn stack (production).
#   1. docker compose down       — hạ stack cũ
#   2. up -d --build             — build image mới + chạy nền
#   3. docker image prune -f     — dọn image mồ côi (<none>) để đỡ tốn đĩa
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

echo "==> [1/3] Hạ stack hiện tại..."
dc down

echo "==> [2/3] Build image & khởi động (detached)..."
dc up -d --build

echo "==> [3/3] Dọn image mồ côi..."
docker image prune -f

echo ""
echo "==> Trạng thái:"
dc ps
echo ""
echo "Xong. Xem log:  ./scripts/logs.sh"
