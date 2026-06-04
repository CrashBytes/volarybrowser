#!/usr/bin/env bash
# Start webpack bundlers (main, preload, renderer dev server), wait for the
# first compile + dev server to be live, then launch Electron. Tearing down
# the script (Ctrl-C or Electron quit) stops the bundlers.
set -euo pipefail

cd "$(dirname "$0")/.."

DEV_PORT="${VOLARY_DEV_PORT:-3000}"
LOG_DIR=".dev-logs"
mkdir -p "$LOG_DIR"
BUNDLER_LOG="$LOG_DIR/bundlers.log"
: > "$BUNDLER_LOG"

BUNDLER_PID=""
ELECTRON_PID=""

cleanup() {
  trap - EXIT INT TERM
  echo "[dev] shutting down..."
  if [[ -n "$ELECTRON_PID" ]] && kill -0 "$ELECTRON_PID" 2>/dev/null; then
    kill "$ELECTRON_PID" 2>/dev/null || true
  fi
  if [[ -n "$BUNDLER_PID" ]] && kill -0 "$BUNDLER_PID" 2>/dev/null; then
    pkill -P "$BUNDLER_PID" 2>/dev/null || true
    kill "$BUNDLER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if lsof -nP -iTCP:"$DEV_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[dev] port $DEV_PORT is already in use — stop the other dev session first." >&2
  exit 1
fi

echo "[dev] starting bundlers (logs: $BUNDLER_LOG)"
npm run dev >"$BUNDLER_LOG" 2>&1 &
BUNDLER_PID=$!

wait_for_compile() {
  local name="$1"
  echo "[dev] waiting for first $name compile..."
  while true; do
    if grep -qE "\[$name\] webpack .* compiled" "$BUNDLER_LOG"; then
      return 0
    fi
    if ! kill -0 "$BUNDLER_PID" 2>/dev/null; then
      echo "[dev] bundlers exited before $name compiled. Last log lines:" >&2
      tail -40 "$BUNDLER_LOG" >&2
      exit 1
    fi
    sleep 1
  done
}

wait_for_compile main
wait_for_compile preload
wait_for_compile renderer

echo "[dev] waiting for dev server at http://localhost:$DEV_PORT ..."
until curl -sSf "http://localhost:$DEV_PORT" >/dev/null 2>&1; do
  if ! kill -0 "$BUNDLER_PID" 2>/dev/null; then
    echo "[dev] bundlers exited before dev server came up." >&2
    exit 1
  fi
  sleep 1
done

echo "[dev] launching Electron..."
npx --no-install electron dist/main.js &
ELECTRON_PID=$!

# Exit when Electron quits; trap tears the bundlers down.
wait "$ELECTRON_PID"
