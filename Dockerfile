# syntax=docker/dockerfile:1

# =============================================================================
# THE Fulfillment — Frontend (Nuxt 3) production image
#
# App là SPA (ssr: false) nhưng Nitro build ra preset `node-server`, nên toàn
# bộ artifact self-contained nằm trong .output và chạy bằng `node
# .output/server/index.mjs` (mặc định lắng nghe cổng 3000).
#
#   docker build -t fulfillment-web .
#   docker run -p 3000:3000 fulfillment-web
# =============================================================================

# ------------------------------------------------------------------ base ----
# Node 22 LTS (Alpine) — nhẹ, tương thích Nuxt 3.14 / Nitro 2.13. Pin theo digest
# không cần thiết ở đây; tag LTS đủ ổn định cho môi trường nội bộ.
FROM node:22-alpine AS base
WORKDIR /app
# corepack off — dự án dùng npm (có package-lock.json).
ENV npm_config_update_notifier=false

# --------------------------------------------------------------- deps -------
# Layer riêng chỉ phụ thuộc vào package.json + lockfile → cache lại khi mã nguồn
# đổi mà dependency không đổi. `--ignore-scripts` bỏ qua postinstall
# (`nuxt prepare`) vì nó cần toàn bộ source; bước `nuxt build` tự chạy prepare.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# --------------------------------------------------------------- build ------
FROM base AS builder
# URL backend được nhúng vào bundle client lúc build (app là SPA nên giá trị này
# đi vào payload gửi cho trình duyệt). Override khi build:
#   docker build --build-arg NUXT_PUBLIC_API_BASE_URL=https://api.example.com -t fulfillment-web .
ARG NUXT_PUBLIC_API_BASE_URL=http://localhost:8090
ENV NUXT_PUBLIC_API_BASE_URL=$NUXT_PUBLIC_API_BASE_URL
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --------------------------------------------------------------- runner -----
# Image runtime chỉ chứa Node + thư mục .output (đã gồm node_modules tối thiểu
# của Nitro), không có devDependencies, source, hay build cache.
FROM node:22-alpine AS runner
WORKDIR /app

# tini: PID 1 đúng chuẩn — forward tín hiệu (SIGTERM) và thu hồi zombie process.
# tzdata: để biến TZ (Asia/Ho_Chi_Minh) có hiệu lực → dấu thời gian log đúng giờ VN.
RUN apk add --no-cache tini tzdata

ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    HOST=0.0.0.0 \
    PORT=3000

# Chạy bằng user không phải root (`node` có sẵn trong image chính thức).
COPY --from=builder --chown=node:node /app/.output ./.output
USER node

EXPOSE 3000

# Healthcheck dùng wget của busybox (có sẵn trong Alpine) — không cần cài thêm.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
