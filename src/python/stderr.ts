import { StringDecoder } from 'string_decoder';

import logger from '../logger';

export const MAX_STDERR_BUFFER_LENGTH = 16_384;

type StderrLevel = 'debug' | 'info' | 'warn' | 'error';

export class PythonStderrLogger {
  private buffer = '';
  private decoder = new StringDecoder('utf8');
  private inTraceback = false;

  constructor(private readonly prefix = '') {}

  handleData(data: Buffer | string): void {
    const text = typeof data === 'string' ? data : this.decoder.write(data);
    this.buffer += text;

    const carry = this.buffer.endsWith('\r') ? '\r' : '';
    const normalized = (carry ? this.buffer.slice(0, -1) : this.buffer).replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');
    this.buffer = (lines.pop() ?? '') + carry;

    for (const line of lines) {
      this.logLine(line);
    }

    if (this.buffer.length >= MAX_STDERR_BUFFER_LENGTH) {
      this.logLine(this.buffer);
      this.buffer = '';
    }
  }

  flush(): void {
    const remaining = this.buffer + this.decoder.end();
    this.buffer = '';

    if (remaining) {
      for (const line of remaining.split(/\r\n|[\r\n]/)) {
        this.logLine(line);
      }
    }

    this.inTraceback = false;
    this.decoder = new StringDecoder('utf8');
  }

  private logLine(line: string): void {
    if (!line.trim()) {
      this.inTraceback = false;
      return;
    }

    if (this.inTraceback && /^\s/.test(line)) {
      this.writeLog('error', line);
      return;
    }

    const trimmedStart = line.trimStart();
    if (/^Traceback \(most recent call last\):/i.test(trimmedStart)) {
      this.inTraceback = true;
      this.writeLog('error', line);
      return;
    }

    const prefixMatch = /^(DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|FATAL)\b[: ]?/i.exec(
      trimmedStart,
    );
    if (prefixMatch) {
      this.inTraceback = false;
      this.writeLog(this.normalizeLevel(prefixMatch[1]), line);
      return;
    }

    if (this.inTraceback) {
      this.inTraceback = false;
      this.writeLog('error', line);
      return;
    }

    if (
      /^(During handling of the above exception|The above exception was the direct cause)/i.test(
        trimmedStart,
      )
    ) {
      this.writeLog('error', line);
      return;
    }

    this.writeLog('warn', line);
  }

  private normalizeLevel(level: string): StderrLevel {
    switch (level.toUpperCase()) {
      case 'DEBUG':
        return 'debug';
      case 'INFO':
        return 'info';
      case 'WARN':
      case 'WARNING':
        return 'warn';
      case 'ERROR':
      case 'CRITICAL':
      case 'FATAL':
        return 'error';
      default:
        return 'warn';
    }
  }

  private writeLog(level: StderrLevel, line: string): void {
    logger[level](`${this.prefix}${line}`);
  }
}
