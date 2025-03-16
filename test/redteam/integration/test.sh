#!/usr/bin/env bash
set -euo pipefail

# Run the CLI tool and capture the output
output=$(npm run bin redteam generate -- -c test/redteam/integration/promptfooconfig.yaml)

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
if echo "$output" | grep -q "Wrote 24 test cases to redteam.yaml"; then
  echo "Expected line (Wrote 24 new test cases to redteam.yaml) found for promptfoo redteam generate"
else
  echo "ERROR: Expected line (Wrote 24 test cases to redteam.yaml) not found in output."
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

if echo "$output" | grep -q "Errors: 0"; then
  echo "Expected line found (Errors: 0) for promptfoo redteam eval"
else
  echo "ERROR: Expected line (Errors: 0) not found in output."
  echo "$output"
  exit 1
fi

echo "All checks passed!"
exit 0
