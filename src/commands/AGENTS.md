# CLI Commands

Commander.js-based CLI commands registered in `src/main.ts`.

## Command Structure

See `src/commands/eval.ts` for the standard pattern:

- Register with Commander
- Use `setupEnv()` for environment
- Track with `telemetry.record()`
- Use `logger` for output (never `console`)
- Set `process.exitCode = 1` on errors

## Critical Patterns

**Always use logger:**

```typescript
logger.info('Output message'); // Correct
console.log('message'); // NEVER
```

**Track telemetry:**

```typescript
telemetry.record('command_used', { name: 'mycommand' });
```

**Handle errors:**

```typescript
try {
  await doSomething();
} catch (error) {
  logger.error(`Failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
  return;
}
```

## Directory Structure

```
src/commands/
├── eval.ts        # Main eval command
├── init.ts        # Project init
├── config.ts      # Config subcommands
├── list.ts        # List resources
├── generate/      # Dataset generation
└── mcp/           # MCP server tools
```

## Testing Locally

```bash
npm link && promptfoo mycommand --help
npm run local -- mycommand --verbose
```

## Interactive UI Support

Commands that display lists or interactive content can support the Ink-based terminal UI. Interactive mode is **opt-in** via environment variable.

**Adding interactive support to a command:**

```typescript
.action(async (cmdObj) => {
  // Check if interactive UI should be used (via PROMPTFOO_ENABLE_INTERACTIVE_UI env var)
  if (shouldUseInkList()) {
    // Use Ink-based UI
    const result = await runInkList({ resourceType: 'evals', items });
    // Handle selection...
    return;
  }

  // Fall back to table output
  logger.info(wrapTable(tableData, columnWidths));
});
```

**Key principles:**

- Always provide non-interactive fallback (table output)
- Use `shouldUseInkList()` or `shouldUseInkUI()` to check
- Users enable via `PROMPTFOO_ENABLE_INTERACTIVE_UI=true`
- Show rich details when user selects an item

See `src/ui/AGENTS.md` for detailed interactive UI guidelines.

## Do / Don't

**Do:** Use logger, track telemetry, validate with Zod, set exitCode on errors

**Don't:** Use console, throw in action handlers, skip telemetry, use `process.exit()`
