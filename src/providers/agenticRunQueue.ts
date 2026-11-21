export function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

interface Turn {
  /** A remote cancellation can outlive the caller but must finish before the next turn. */
  releaseAfter?: Promise<unknown>;
}

// Native Map storage preserves provider serialization fallback output.
export class AgenticRunQueue extends Map<string, Promise<void>> {
  readonly #abortMessage: string;

  constructor(abortMessage: string) {
    super();
    this.#abortMessage = abortMessage;
  }

  async run<T>(
    queueKey: string | undefined,
    abortSignal: AbortSignal | undefined,
    executeTurn: (turn: Turn) => Promise<T>,
  ): Promise<T> {
    const turn: Turn = {};
    if (!queueKey) {
      return executeTurn(turn);
    }

    const previousRun = this.get(queueKey) ?? Promise.resolve();
    let releaseCurrentRun: () => void = () => {};
    const currentRun = new Promise<void>((resolve) => {
      releaseCurrentRun = () => resolve();
    });
    const queuedRun = previousRun.catch(() => undefined).then(() => currentRun);
    this.set(queueKey, queuedRun);
    void queuedRun.finally(() => {
      if (this.get(queueKey) === queuedRun) {
        this.delete(queueKey);
      }
    });

    try {
      await this.wait(previousRun, abortSignal);
      return await executeTurn(turn);
    } finally {
      if (turn.releaseAfter) {
        void turn.releaseAfter.then(releaseCurrentRun, releaseCurrentRun);
      } else {
        releaseCurrentRun();
      }
    }
  }

  async wait(previousRun: Promise<void>, abortSignal: AbortSignal | undefined): Promise<void> {
    const previousRunDone = previousRun.catch(() => undefined);

    if (!abortSignal) {
      await previousRunDone;
      return;
    }

    if (abortSignal.aborted) {
      throw createAbortError(this.#abortMessage);
    }

    let onAbort: (() => void) | undefined;
    const abortPromise = new Promise<void>((_, reject) => {
      onAbort = () => reject(createAbortError(this.#abortMessage));
      abortSignal.addEventListener('abort', onAbort, { once: true });
    });

    try {
      await Promise.race([previousRunDone, abortPromise]);
    } finally {
      if (onAbort) {
        abortSignal.removeEventListener('abort', onAbort);
      }
    }
  }
}
