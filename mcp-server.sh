#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the MCP server from the correct directory
cd "$SCRIPT_DIR"
exec npx ts-node --transpileOnly src/main.ts "$@"