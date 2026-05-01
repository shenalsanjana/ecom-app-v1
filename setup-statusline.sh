#!/bin/bash
# Status Line Setup Script for Claude Code
# Works on Unix/Linux/macOS or Git Bash on Windows

CLAUDE_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/claude"
SETTINGS_FILE="$CLAUDE_CONFIG_DIR/settings.json"

# Create config directory if it doesn't exist
mkdir -p "$CLAUDE_CONFIG_DIR"

# Create settings.json with status line configuration
cat > "$SETTINGS_FILE" << 'EOF'
{
  "statusline": {
    "model": true,
    "directory": true,
    "gitBranch": true,
    "contextRemaining": true,
    "outputStyle": true
  }
}
EOF

echo "Status line configured successfully!"
echo "Settings saved to: $SETTINGS_FILE"
