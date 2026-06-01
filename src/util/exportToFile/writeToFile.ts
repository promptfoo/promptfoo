import { createWriteStream, type WriteStream } from 'fs';

export class JsonlFileWriter {
  private readonly flags: 'a' | 'w';
  private writeStream: WriteStream | undefined;

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
      this.writeStream = createWriteStream(this.filePath, { flags: this.flags });
    }
    return this.writeStream;
  }

  async write(data: Record<string, any>): Promise<void> {
    const jsonLine = JSON.stringify(data) + '\n';
    const stream = this.getStream();

    return new Promise<void>((resolve, reject) => {
      stream.write(jsonLine, (error) => {
        if (error) {
          reject(error);
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
      const onError = (error: Error) => {
        reject(new Error(`Failed to close JSONL output ${this.filePath}: ${error.message}`));
      };
      stream.once('error', onError);
      stream.end(() => {
        // The stream finished flushing. Swap the rejecting listener for a no-op so a late
        // fd-close error (emitted after 'finish') is swallowed rather than thrown as an
        // unhandled 'error' event that would crash the process — the bytes are on disk.
        stream.off('error', onError);
        stream.on('error', () => {});
        resolve();
      });
    });
  }
}
