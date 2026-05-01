@echo off
REM Status Line Setup Script for Claude Code on Windows
REM Run this script to configure the status line globally

set CLAUDE_CONFIG_DIR=%APPDATA%\Claude
set SETTINGS_FILE=%CLAUDE_CONFIG_DIR%\settings.json

REM Create config directory if it doesn't exist
if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%"

REM Create settings.json with status line configuration
(
echo {
echo   "statusline": {
echo     "model": true,
echo     "directory": true,
echo     "gitBranch": true,
echo     "contextRemaining": true,
echo     "outputStyle": true
echo   }
echo }
) > "%SETTINGS_FILE%"

echo Status line configured successfully!
echo Settings saved to: %SETTINGS_FILE%