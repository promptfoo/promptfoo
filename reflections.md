# CLI Lifecycle Fix: View Command Exit & Eval Hanging

## The Problem

- `promptfoo eval` would hang indefinitely after completing evaluations
- `promptfoo view` worked but had a hidden bug (cleanup running too early, visible in verbose logs)

## Timeline

### 1. ESM Migration
The codebase migrated from CommonJS to ESM, still using `main().finally()` without `await`.

### 2. Eval Hanging (Pre-existing)
Eval commands had been hanging indefinitely (predating ESM migration). Some resource kept the event loop alive - likely unclosed database connections, HTTP connection pools, or other handles. This resource leak still exists; our fix masks it with `process.exit()`.

### 3. View Was Subtly Broken
Running `promptfoo view --verbose` showed:
```
Shutting down gracefully...
Shutdown complete
Server running at http://localhost:15500...
```

The shutdown logs fired immediately after starting the server. The view command still worked because the HTTP server listener kept the Node.js event loop alive, preventing process exit despite cleanup having already run.

### 4. We Fixed Eval (But Broke View)
To fix eval hanging, we added `process.exit()` with a 3-second timeout. This made eval exit cleanly but caused view to exit after 3 seconds instead of running until Ctrl+C. The `process.exit()` made the view bug fatal.

## Root Cause

`startServer()` was an async function that resolved immediately after calling `httpServer.listen()` (which is non-blocking):

```typescript
export async function startServer(port, browserBehavior) {
  httpServer.listen(port, () => { /* ... */ });
  // Function ends - Promise resolves immediately!
}
```

Flow: `await startServer()` → `listen()` registered → function returns → `main()` completes → cleanup runs → `process.exit()` kills process → (server still binding in background)

## The Solution

Make `startServer()` block until the server actually stops:

```typescript
export async function startServer(port, browserBehavior) {
  const watcher = setupSignalWatcher(/*...*/);
  
  return new Promise<void>((resolve, reject) => {
    httpServer.listen(port, () => { /* ... */ }).on('error', reject);
    
    const shutdown = () => {
      watcher.close();
      httpServer.close(() => resolve());
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
```

Also use `.unref()` on the exit timeout to allow natural process exit:

```typescript
const shutdownGracefully = async () => {
  await telemetry.shutdown();
  closeLogger();
  closeDbIfOpen();
  await dispatcher.destroy();
  
  setTimeout(() => {
    process.exit(process.exitCode || 0);
  }, 100).unref();  // Natural exit if handles close, force if stuck
}
```

## Key Insights

1. **Async functions should complete when work is done** - If `startServer()` starts a long-running server, it should block until that server stops
2. **Signal handlers for shutdown** - SIGINT/SIGTERM handlers gracefully close resources before resolving promises
3. **`.unref()` for exit timeouts** - Allows natural exit without blocking, forces exit if resources linger
4. **Commander.js lifecycle** - `parseAsync()` resolves when actions complete; async actions must truly wait for their work
5. **Hidden bugs surface** - The view bug existed since ESM migration but only became obvious with `process.exit()`

## What This Fixed

✅ View runs until Ctrl+C, cleans up gracefully  
✅ Eval exits promptly (masked by `process.exit()`)  
✅ File watchers/DB/connections properly closed  
✅ Fast exit (100ms vs 3 seconds)

**Note:** Eval hanging is still masked, not truly fixed - an unknown resource leak remains.
