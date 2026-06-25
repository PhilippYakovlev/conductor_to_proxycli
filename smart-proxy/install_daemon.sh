#!/bin/bash

# Переходим в директорию скрипта
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

PLIST_PATH="$HOME/Library/LaunchAgents/com.conductor.proxy.launcher.plist"
NODE_PATH=$(which node)

if [ -z "$NODE_PATH" ]; then
  echo "Error: Node.js not found in PATH. Please make sure node is installed."
  exit 1
fi

echo "Found Node.js at: $NODE_PATH"
echo "Creating LaunchAgent plist at: $PLIST_PATH"

cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.conductor.proxy.launcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$PROJECT_DIR/launcher_daemon.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/conductor_launcher_daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/conductor_launcher_daemon.err.log</string>
</dict>
</plist>
EOF

echo "Unloading existing LaunchAgent if any..."
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl stop com.conductor.proxy.launcher 2>/dev/null

echo "Loading LaunchAgent..."
launchctl load "$PLIST_PATH"

echo "Starting LaunchAgent..."
launchctl start com.conductor.proxy.launcher

echo "Successfully installed and started Conductor Launcher Daemon!"
echo "Check logs at /tmp/conductor_launcher_daemon.log"
