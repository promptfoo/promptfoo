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
        this.writeStream.off('error', onError);
        resolve();
      });
    });
  }
}
