#!/usr/bin/env bash
# =============================================================================
# _lib.sh — hàm/biến dùng chung cho các script vận hành stack Docker.
# Không chạy trực tiếp; các script khác `source` file này.
# =============================================================================
set -euo pipefail

# Thư mục repo = thư mục cha của scripts/ (nơi có docker-compose.yml).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

ENV_FILE="${ENV_FILE:-.env.docker}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

# Yêu cầu Docker Compose v2 (lệnh `docker compose`).
if ! docker compose version >/dev/null 2>&1; then
  echo "LỖI: cần Docker Compose v2 (lệnh 'docker compose'). Cài Docker Engine + compose plugin." >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "LỖI: thiếu ${ENV_FILE}. Tạo từ mẫu:  cp .env.docker.example ${ENV_FILE} && chmod 600 ${ENV_FILE}" >&2
  exit 1
fi

# Gói lệnh compose kèm --env-file (nguồn cấu hình duy nhất cho toàn stack).
dc() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}
