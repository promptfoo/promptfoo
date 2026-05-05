import { z } from 'zod';

/**
 * Identifies the caller invoking the evaluator. Library code keys process-lifecycle
 * behavior off `'cli'` (e.g. installs SIGINT handlers, mutates `process.exitCode`),
 * so adding a new source means deciding whether it should opt into CLI semantics.
 *
 * Lives in its own module to avoid a `src/types/index.ts` ↔ `src/redteam/types.ts`
 * import cycle.
 */
export const EVENT_SOURCES = ['cli', 'library', 'web', 'mcp', 'default'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];
export const EventSourceSchema = z.enum(EVENT_SOURCES);
