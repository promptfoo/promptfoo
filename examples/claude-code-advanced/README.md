# claude-code-advanced

Advanced example of Claude Code with write permissions, demonstrating file modification capabilities.

## ⚠️ Warning

This example modifies files in the `workspace` directory. The configuration uses `permission_mode: 'acceptEdits'` which allows Claude Code to write files.

## Setup

```bash
export ANTHROPIC_API_KEY=your-key-here
npx promptfoo@latest eval
```

## What's happening?

- Claude Code reads and modifies files in the `workspace` directory
- Adds type hints, docstrings, and new methods to Python code
- Tests verify the modifications were made correctly
- Uses hooks to reset files after each test
- Demonstrates the full power of Claude Code for code refactoring tasks

## Permission Modes

- `plan`: (default) Claude Code plans changes but doesn't execute them
- `acceptEdits`: Allows file modifications (used in this example)
- `bypassPermissions`: Skips all permission checks (use with extreme caution)

## Cleanup

The example uses an `afterEach` hook to restore files to their original state after each test run.