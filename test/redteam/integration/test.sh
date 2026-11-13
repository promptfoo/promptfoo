#!/usr/bin/env bash
set -euo pipefail

# Exercise the live generation and grading APIs without depending on the demo
# chatbot's model service. Keep a real HTTP target and its response transform.
target_dir=$(mktemp -d)
node --input-type=module - "$target_dir/url" <<'NODE' &
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const server = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/chat') {
    response.writeHead(404).end();
    return;
  }
  let body = '';
  for await (const chunk of request) {
    body += chunk;
  }
  try {
    const { messages } = JSON.parse(body);
    if (!Array.isArray(messages) || !messages.some(({ role, content }) =>
      role === 'user' && typeof content === 'string' && content.length > 0)) {
      throw new Error('Expected a nonempty user message');
    }
  } catch {
    response.writeHead(400).end('Invalid chat request');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ choices: [{ message: { role: 'assistant',
    content: 'Red pandas live in forests in the eastern Himalayas and southwestern China.'
  } }] }));
});
server.listen(0, '127.0.0.1', () => {
  writeFileSync(process.argv[2], `http://127.0.0.1:${server.address().port}/chat`);
});
NODE
target_pid=$!
cleanup() {
  kill "$target_pid" 2>/dev/null || true
  wait "$target_pid" 2>/dev/null || true
  rm -rf "$target_dir"
}
trap cleanup EXIT
for ((attempt = 0; attempt < 100; attempt++)); do
  if [ -s "$target_dir/url" ]; then
    break
  fi
  if ! kill -0 "$target_pid" 2>/dev/null; then
    echo 'ERROR: Integration target failed to start'
    exit 1
  fi
  sleep 0.1
done
if [ ! -s "$target_dir/url" ]; then
  echo 'ERROR: Integration target did not become ready'
  exit 1
fi
PROMPTFOO_INTEGRATION_TARGET_URL=$(cat "$target_dir/url")
export PROMPTFOO_INTEGRATION_TARGET_URL

# Clean up old test artifacts
rm -f promptfoo-errors.log redteam.yaml

# Run the CLI tool and capture the output
# Use a temp file so we can display output on failure (logger writes to stdout)
generate_output_file=$(mktemp)
if ! npm run bin redteam generate -- -c test/redteam/integration/promptfooconfig.yaml --force >"$generate_output_file" 2>&1; then
  echo "ERROR: promptfoo redteam generate failed"
  echo "--- Output ---"
  cat "$generate_output_file"
  echo "--- End Output ---"
  rm -f "$generate_output_file"
  exit 1
fi
output=$(cat "$generate_output_file")
rm -f "$generate_output_file"

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
eval_output_file=$(mktemp)
set +e
npm run bin redteam eval -- --no-cache -o "$target_dir/results.json" >"$eval_output_file" 2>&1
exit_code=$?
set -e
output=$(cat "$eval_output_file")
rm -f "$eval_output_file"

if [ $exit_code -ne 0 ]; then
  if [ $exit_code -eq 100 ]; then
    echo "Got exit code 100 - this is acceptable"
  else
    echo "Command failed with exit code $exit_code"
    echo "--- Output ---"
    echo "$output"
    echo "--- End Output ---"
    exit $exit_code
  fi
fi
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

# Check the exported results as well as the CLI summary. Policy failures are
# expected in a redteam scan; provider or grading errors are not.
node --input-type=module - "$target_dir/results.json" <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { results } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(results.results.length, 3, 'Expected every generated test to run');
assert.equal(results.stats.errors, 0, 'Integration evaluation had errors');
for (const result of results.results) {
  assert.equal(typeof result.response.output, 'string');
  assert.ok(result.response.output.length > 0, 'HTTP target returned no output');
  assert.ok(!result.response.error, 'HTTP target returned an error');
  console.log(JSON.stringify({
    plugin: result.testCase.metadata.pluginId,
    strategy: result.testCase.metadata.strategyId,
    success: result.success,
    score: result.score,
    error: result.error,
  }));
}
NODE

echo "All checks passed!"
exit 0
