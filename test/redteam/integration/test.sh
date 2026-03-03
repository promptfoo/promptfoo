#!/usr/bin/env bash
set -euo pipefail

# Clean up old test artifacts
rm -f promptfoo-errors.log redteam.yaml

# Run the CLI tool and capture the output
output=$(npm run bin redteam generate -- -c test/redteam/integration/promptfooconfig.yaml --force)

echo "Done running promptfoo redteam generate"

# Check if error log exists and display contents if it does
if [ -f "promptfoo-errors.log" ]; then
  echo "ERROR: promptfoo-errors.log exists:"
  cat "promptfoo-errors.log"
  exit 1
else
  echo "Confirmed: No promptfoo-errors.log file exists"
fi

# Check for expected output patterns
# With numTests: 1 on jailbreak:composite, we get 2 plugin tests + 1 strategy test = 3 total
if echo "$output" | grep -q "Wrote 3 test cases to redteam.yaml"; then
  echo "Expected line (Wrote 3 test cases to redteam.yaml) found for promptfoo redteam generate"
else
  echo "ERROR: Expected line (Wrote 3 test cases to redteam.yaml) not found in output."
  echo "$output"
  exit 1
fi

echo "Running promptfoo redteam eval"
export PROMPTFOO_AUTHOR="ci-placeholder@promptfoo.dev"
output=$(npm run bin redteam eval) || {
  exit_code=$?
  if [ $exit_code -eq 100 ]; then
    echo "Got exit code 100 - this is acceptable"
  else
    echo "Command failed with exit code $exit_code"
    exit $exit_code
  fi
}
echo "Done running promptfoo redteam eval"

echo "Checking for errors in promptfoo-errors.log"
if [ -f "promptfoo-errors.log" ]; then
  echo "ERROR: promptfoo-errors.log exists:"
  cat "promptfoo-errors.log"
  exit 1
else
  echo "Confirmed: No promptfoo-errors.log file exists"
fi

if echo "$output" | grep -q "0 errors"; then
  echo "Expected line found (0 errors) for promptfoo redteam eval"
else
  echo "ERROR: Expected line (0 errors) not found in output."
  echo "$output"
  exit 1
fi

echo "All checks passed!"
exit 0
