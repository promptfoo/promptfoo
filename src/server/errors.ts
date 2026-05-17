export type ServerErrorPhase = 'startup' | 'runtime';

function buildServerErrorMessage(
  error: NodeJS.ErrnoException,
  port: number,
  phase: ServerErrorPhase,
): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (phase === 'runtime') {
    return `Server error: ${detail}`;
  }
  if (error.code === 'EADDRINUSE') {
    return `Port ${port} is already in use. Do you have another Promptfoo instance running?`;
  }
  return `Failed to start server: ${detail}`;
}

/**
 * Server failures returned to reusable callers after the server path has already
 * logged the user-facing message.
 *
 * Lives in a leaf module (no internal imports) so `src/index.ts` can re-export it
 * without creating a `src/index.ts` ↔ `src/server/server.ts` cycle.
 */
export class ServerError extends Error {
  readonly code?: string;
  readonly phase: ServerErrorPhase;
  readonly port: number;

  constructor(error: NodeJS.ErrnoException, port: number, phase: ServerErrorPhase) {
    super(buildServerErrorMessage(error, port, phase), { cause: error });
    this.name = 'ServerError';
    this.code = error.code;
    this.phase = phase;
    this.port = port;
  }
}
