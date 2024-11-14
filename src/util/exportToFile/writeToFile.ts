import { createWriteStream, type WriteStream } from 'fs';

export class JsonlFileWriter {
  private writeStream: WriteStream;

  constructor(private filePath: string) {
    this.writeStream = createWriteStream(filePath, { flags: 'a' });
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
    return new Promise<void>((resolve) => {
      this.writeStream.end(resolve);
    });
  }
}
