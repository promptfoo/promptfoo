#!/bin/bash
set -e

# Source environment
export NVM_DIR="/usr/local/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PYENV_ROOT="/usr/local/pyenv"
export PATH="$PYENV_ROOT/shims:$PYENV_ROOT/bin:$PATH"
export RBENV_ROOT="/usr/local/rbenv"
export PATH="$RBENV_ROOT/shims:$RBENV_ROOT/bin:$PATH"
export PATH="$PATH:/usr/local/go/bin"

# Generate unique runner name
RUNNER_NAME="${RUNNER_PREFIX:-promptfoo}-$(hostname | cut -c1-8)-$(date +%s | tail -c 5)"
GITHUB_REPO_URL="https://github.com/${GITHUB_REPO}"

echo "=========================================="
echo "Configuring GitHub Actions Runner"
echo "Runner Name: ${RUNNER_NAME}"
echo "Repository: ${GITHUB_REPO_URL}"
echo "Labels: self-hosted,linux,x64,gcp,ubuntu-latest"
echo "=========================================="

# Configure runner
./config.sh --unattended \
  --url "${GITHUB_REPO_URL}" \
  --pat "${GITHUB_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "self-hosted,linux,x64,gcp,ubuntu-latest" \
  --ephemeral \
  --replace

# Cleanup function
cleanup() {
  echo "Removing runner registration..."
  ./config.sh remove --unattended --pat "${GITHUB_TOKEN}" || true
}

# Trap signals for graceful shutdown
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

# Run the runner
echo "Starting runner..."
./run.sh &
wait $!
