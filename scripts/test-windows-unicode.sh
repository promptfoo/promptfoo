#!/bin/bash

# Quick script to test Windows Unicode issue via GitHub Actions

set -e

echo "🚀 Testing Windows Unicode issue via GitHub Actions..."

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not in a git repository. Please run this from the promptfoo directory."
    exit 1
fi

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Install it with: brew install gh"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "🔐 Please authenticate with GitHub CLI:"
    gh auth login
fi

echo "📝 Committing current changes (if any)..."
if ! git diff --quiet || ! git diff --cached --quiet; then
    git add .
    git commit -m "Add Windows testing workflow and scripts

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>" || true
fi

echo "📤 Pushing to GitHub..."
git push origin main

echo "🏃 Triggering Windows Unicode test workflow..."
gh workflow run windows-unicode-test.yml

echo "⏳ Waiting a moment for workflow to start..."
sleep 5

echo "📊 Opening workflow runs in browser..."
gh workflow view windows-unicode-test.yml --web

echo "✅ Windows Unicode test workflow triggered!"
echo ""
echo "You can also check the status with:"
echo "  gh run list --workflow=windows-unicode-test.yml"
echo "  gh run watch <run-id>"