import { createWriteStream, type WriteStream } from 'fs';

export class JsonlFileWriter {
  private readonly flags: 'a' | 'w';
  private writeStream: WriteStream | undefined;
  // The first async stream error (e.g. an fd failure that surfaces between writes). Captured
  // by a persistent listener so it can be re-thrown from the next write()/close() instead of
  // escaping as an unhandled 'error' event that would crash the process.
  private streamError: Error | undefined;

  constructor(
    private filePath: string,
    { append = false }: { append?: boolean } = {},
  ) {
    // Open lazily on the first write so we never truncate an existing file for an eval that
    // produces no rows — e.g. one that throws during setup before writing anything. The
    // first write still truncates (flags 'w') so a reused path holds only the current run.
    this.flags = append ? 'a' : 'w';
  }

  private getStream(): WriteStream {
    if (!this.writeStream) {
      const stream = createWriteStream(this.filePath, { flags: this.flags });
      // Keep a persistent listener for the stream's lifetime so an error emitted while no
      // write is in flight is recorded rather than thrown. write()/close() surface it as a
      // rejected promise with the output path.
      stream.on('error', (error: Error) => {
        if (!this.streamError) {
          this.streamError = error;
        }
      });
      this.writeStream = stream;
    }
    return this.writeStream;
  }

  // Attach the output path to a stream error so callers (e.g. the evaluator aggregating
  // writer failures) can attribute it to a specific file. Shared by write() and close() so
  // both rejection paths report the path consistently; the original error is kept as `cause`.
  private wrapStreamError(action: 'write' | 'close', error: Error): Error {
    return new Error(`Failed to ${action} JSONL output ${this.filePath}: ${error.message}`, {
      cause: error,
    });
  }

  async write(data: unknown): Promise<void> {
    if (this.streamError) {
      throw this.wrapStreamError('write', this.streamError);
    }
    const jsonLine = JSON.stringify(data) + '\n';
    const stream = this.getStream();

    return new Promise<void>((resolve, reject) => {
      stream.write(jsonLine, (error) => {
        if (error) {
          reject(this.wrapStreamError('write', error));
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    const stream = this.writeStream;
    if (!stream) {
      // Nothing was ever written, so no stream was opened and the destination is untouched.
      return;
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let closeError = this.streamError;
      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        stream.off('error', onError);
        stream.off('close', onClose);
        if (error) {
          reject(this.wrapStreamError('close', error));
        } else {
          resolve();
        }
      };
      const onError = (error: Error) => {
        closeError ??= error;
      };
      const onClose = () => finish(closeError);
      stream.once('error', onError);
      stream.once('close', onClose);

      if (stream.closed) {
        onClose();
      } else if (!stream.destroyed) {
        try {
          stream.end();
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)));
          stream.destroy();
        }
      }
    });
  }
}
