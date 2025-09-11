#!/bin/bash

# Setup script for Windows development environment using Docker

set -e

echo "Setting up Windows development environment for promptfoo..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

# Check if Docker supports Windows containers
if ! docker version --format '{{.Server.Os}}' | grep -q "windows\|linux"; then
    echo "⚠️  Make sure Docker Desktop is configured to support Windows containers"
    echo "   Go to Docker Desktop Settings > General > Use Windows containers"
fi

echo "🐳 Building Windows development container..."
docker compose -f docker-compose.windows.yml build promptfoo-windows

echo "🚀 Starting Windows development environment..."
docker compose -f docker-compose.windows.yml up -d promptfoo-windows

echo "✅ Windows development environment is ready!"
echo ""
echo "Available commands:"
echo "  🔧 Access container shell:     docker exec -it promptfoo-windows-dev powershell"
echo "  🤖 Start Claude Code:          docker compose -f docker-compose.windows.yml up -d promptfoo-windows-claude"
echo "  🧪 Run Unicode test:           docker compose -f docker-compose.windows.yml run --rm promptfoo-windows-test"
echo "  🔍 View logs:                  docker compose -f docker-compose.windows.yml logs -f promptfoo-windows"
echo "  🛑 Stop environment:           docker compose -f docker-compose.windows.yml down"
echo ""
echo "🌐 Development server will be available at: http://localhost:3000"
echo ""
echo "🤖 To use Claude Code in Windows environment:"
echo "  Option 1: docker compose -f docker-compose.windows.yml up -d promptfoo-windows-claude"
echo "  Option 2: docker exec -it promptfoo-windows-dev powershell -Command claude-code"