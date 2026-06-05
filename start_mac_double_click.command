#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
chmod +x start_mac.command 2>/dev/null || true
ROOT_DIR="$(pwd)"
ESCAPED_ROOT="${ROOT_DIR//\'/\'\\\'\'}"

osascript <<EOF
tell application "Terminal"
  activate
  do script "cd '${ESCAPED_ROOT}'; /bin/bash start_mac.command --backend"
  do script "cd '${ESCAPED_ROOT}'; /bin/bash start_mac.command --frontend"
end tell
EOF
