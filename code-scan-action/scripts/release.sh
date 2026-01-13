#!/bin/bash
#
# Release script for code-scan-action
#
# Usage:
#   ./scripts/release.sh           # Release to v0 tag (production)
#   ./scripts/release.sh --staging # Release to staging branch (testing)
#

set -e

cd "$(dirname "$0")/.."

STAGING=false
TARGET_REF="v0"

while [[ $# -gt 0 ]]; do
  case $1 in
    --staging)
      STAGING=true
      TARGET_REF="staging"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: ./scripts/release.sh [--staging]"
      exit 1
      ;;
  esac
done

echo "🔨 Building action..."
npm run build

echo "📦 Packaging dist..."

if [ "$STAGING" = true ]; then
  echo "🧪 Releasing to staging branch..."

  # Create or update staging branch with current dist
  git stash --include-untracked || true

  # Fetch latest
  git fetch origin

  # Check if staging branch exists
  if git show-ref --verify --quiet refs/remotes/origin/staging; then
    git checkout staging
    git pull origin staging
  else
    git checkout -b staging
  fi

  # Copy dist from the source branch
  git checkout - -- dist/

  # Commit and push
  git add dist/
  git commit -m "chore: update staging action build" --allow-empty
  git push origin staging

  # Return to original branch
  git checkout -
  git stash pop || true

  echo ""
  echo "✅ Released to staging!"
  echo "   Use: promptfoo/code-scan-action@staging"
else
  echo "🚀 Releasing to production (v0 tag)..."

  # Commit dist changes if any
  if ! git diff --quiet dist/; then
    git add dist/
    git commit -m "chore: update action build"
  fi

  # Update v0 tag
  git tag -f v0
  git push origin v0 --force

  echo ""
  echo "✅ Released to production!"
  echo "   Use: promptfoo/code-scan-action@v0"
fi
