import { createWriteStream, type WriteStream } from 'fs';

export class JsonlFileWriter {
  private writeStream: WriteStream;

  constructor(
    private filePath: string,
    { append = false }: { append?: boolean } = {},
  ) {
    this.writeStream = createWriteStream(filePath, { flags: append ? 'a' : 'w' });
  }

  async write(data: Record<string, any>): Promise<void> {
    const jsonLine = JSON.stringify(data) + '\n';

    return new Promise<void>((resolve, reject) => {
      this.writeStream.write(jsonLine, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        reject(new Error(`Failed to close JSONL output ${this.filePath}: ${error.message}`));
      };
      this.writeStream.once('error', onError);
      this.writeStream.end(() => {
        // The stream finished flushing. Swap the rejecting listener for a no-op so a late
        // fd-close error (emitted after 'finish') is swallowed rather than thrown as an
        // unhandled 'error' event that would crash the process — the bytes are on disk.
        this.writeStream.off('error', onError);
        this.writeStream.on('error', () => {});
        resolve();
      });
    });
  }
}
