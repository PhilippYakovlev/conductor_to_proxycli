#!/bin/bash

# Переходим в директорию скрипта
cd "$(dirname "$0")"

echo "[Launcher] Stopping Smart Proxy in Docker..."
docker compose down

echo "[Launcher] Closing Conductor..."
osascript -e 'quit app "Conductor"' 2>/dev/null
echo "[Launcher] Done!"
