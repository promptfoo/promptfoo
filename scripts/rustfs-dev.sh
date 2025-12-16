#!/usr/bin/env bash
set -euo pipefail

# Dev helper to run a local RustFS (S3-compatible) instance for blob storage.
# Usage:
#   scripts/rustfs-dev.sh up     # start container
#   scripts/rustfs-dev.sh down   # stop and remove container
#   scripts/rustfs-dev.sh status # show container status
#   scripts/rustfs-dev.sh logs   # follow logs

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-${ROOT_DIR}/.dev/rustfs/data}"
LOGS_DIR="${LOGS_DIR:-${ROOT_DIR}/.dev/rustfs/logs}"
CONTAINER_NAME="${RUSTFS_CONTAINER_NAME:-promptfoo-rustfs}"
IMAGE="${RUSTFS_IMAGE:-rustfs/rustfs:latest}"
PORT="${RUSTFS_PORT:-9000}"
CONSOLE_PORT="${RUSTFS_CONSOLE_PORT:-9001}"
BUCKET="${RUSTFS_BUCKET:-promptfoo-dev}"
ACCESS_KEY="${RUSTFS_ACCESS_KEY:-rustfsadmin}"
SECRET_KEY="${RUSTFS_SECRET_KEY:-rustfsadmin}"

cmd="${1:-status}"

ensure_dirs() {
  mkdir -p "${DATA_DIR}" "${LOGS_DIR}"
  # RustFS container runs as UID 10001; ensure the host dirs are owned accordingly.
  docker run --rm -v "${DATA_DIR}":/data -v "${LOGS_DIR}":/logs alpine:3.20 \
    sh -c "chown -R 10001:10001 /data /logs" >/dev/null
}

start() {
  ensure_dirs
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${PORT}:9000" \
    -p "${CONSOLE_PORT}:9001" \
    -v "${DATA_DIR}:/data" \
    -v "${LOGS_DIR}:/logs" \
    "${IMAGE}" >/dev/null

  echo "Waiting for rustfs endpoint on http://localhost:${PORT} ..."
  for i in $(seq 1 20); do
    if curl -sSf -o /dev/null "http://localhost:${PORT}"; then
      break
    fi
    sleep 0.5
  done

  echo "Ensuring bucket '${BUCKET}' exists..."
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="${ACCESS_KEY}" \
    -e AWS_SECRET_ACCESS_KEY="${SECRET_KEY}" \
    amazon/aws-cli:2.17.19 \
    --endpoint-url "http://host.docker.internal:${PORT}" \
    s3api create-bucket \
    --bucket "${BUCKET}" >/dev/null 2>&1 || true

  echo "RustFS started: http://localhost:${PORT} (console http://localhost:${CONSOLE_PORT})"
  echo "Bucket ensured: ${BUCKET}"
}

stop() {
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  echo "RustFS stopped"
}

status() {
  docker ps -a --filter "name=${CONTAINER_NAME}"
}

logs() {
  docker logs -f "${CONTAINER_NAME}"
}

case "${cmd}" in
  up) start ;;
  down) stop ;;
  status) status ;;
  logs) logs ;;
  *)
    echo "Usage: $0 {up|down|status|logs}"
    exit 1
    ;;
esac
