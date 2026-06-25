#!/bin/bash

# Переходим в директорию скрипта
cd "$(dirname "$0")"

echo "[Launcher] Starting Smart Proxy in Docker..."
docker compose up -d --build

echo "[Launcher] Launching Conductor with Smart Proxy environment variables..."
CURSOR_API_BASE_URL="http://127.0.0.1:8317/v1" \
CURSOR_BACKEND_URL="http://127.0.0.1:8317" \
CURSOR_WEBSITE_URL="http://127.0.0.1:8317" \
OPENAI_BASE_URL="http://127.0.0.1:8317/v1" \
ANTHROPIC_BASE_URL="http://127.0.0.1:8317" \
/Applications/Conductor.app/Contents/MacOS/conductor > /tmp/conductor_live.log 2>&1 &

echo "[Launcher] Conductor started in background."
echo "[Launcher] Logs are redirected to /tmp/conductor_live.log"
