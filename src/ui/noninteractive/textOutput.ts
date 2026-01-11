/**
 * Non-interactive text output utilities.
 *
 * These utilities provide plain text output for CI environments and
 * non-TTY terminals. They have ZERO Ink/React dependencies.
 */

import chalk from 'chalk';

/**
 * Text output writer for non-interactive mode.
 * Provides structured output without any React/Ink dependencies.
 */
export class TextOutput {
  private stream: NodeJS.WriteStream;
  private useColors: boolean;

  constructor(stream: NodeJS.WriteStream = process.stdout, useColors?: boolean) {
    this.stream = stream;
    this.useColors = useColors ?? (stream.isTTY && !process.env.NO_COLOR);
  }

  /**
   * Write a line to the output stream.
   */
  writeLine(text: string): void {
    this.stream.write(text + '\n');
  }

  /**
   * Write text without a newline.
   */
  write(text: string): void {
    this.stream.write(text);
  }

  /**
   * Write an info message with optional prefix.
   */
  info(message: string): void {
    const prefix = this.useColors ? chalk.blue('info') : 'info';
    this.writeLine(`${prefix}: ${message}`);
  }

  /**
   * Write a success message.
   */
  success(message: string): void {
    const prefix = this.useColors ? chalk.green('success') : 'success';
    this.writeLine(`${prefix}: ${message}`);
  }

  /**
   * Write a warning message.
   */
  warn(message: string): void {
    const prefix = this.useColors ? chalk.yellow('warning') : 'warning';
    this.writeLine(`${prefix}: ${message}`);
  }

  /**
   * Write an error message.
   */
  error(message: string): void {
    const prefix = this.useColors ? chalk.red('error') : 'error';
    this.writeLine(`${prefix}: ${message}`);
  }

  /**
   * Write a header/title.
   */
  header(text: string): void {
    const formattedText = this.useColors ? chalk.bold(text) : text;
    this.writeLine(formattedText);
    this.writeLine('='.repeat(text.length));
  }

  /**
   * Write a section title.
   */
  section(text: string): void {
    const formattedText = this.useColors ? chalk.bold.underline(text) : text;
    this.writeLine('');
    this.writeLine(formattedText);
  }

  /**
   * Write a list item.
   */
  listItem(text: string, indent: number = 0): void {
    const prefix = ' '.repeat(indent * 2) + '- ';
    this.writeLine(prefix + text);
  }

  /**
   * Write a key-value pair.
   */
  keyValue(key: string, value: string): void {
    const formattedKey = this.useColors ? chalk.dim(key + ':') : key + ':';
    this.writeLine(`  ${formattedKey} ${value}`);
  }

  /**
   * Write a blank line.
   */
  blank(): void {
    this.writeLine('');
  }

  /**
   * Write a horizontal rule.
   */
  rule(): void {
    const width = this.stream.columns || 80;
    this.writeLine('-'.repeat(Math.min(width, 80)));
  }

  /**
   * Format text as dim/muted.
   */
  dim(text: string): string {
    return this.useColors ? chalk.dim(text) : text;
  }

  /**
   * Format text as bold.
   */
  bold(text: string): string {
    return this.useColors ? chalk.bold(text) : text;
  }

  /**
   * Format text in a specific color.
   */
  color(text: string, color: 'red' | 'green' | 'yellow' | 'blue' | 'cyan' | 'magenta'): string {
    if (!this.useColors) {
      return text;
    }
    return chalk[color](text);
  }
}

// Singleton instance for convenience
let defaultOutput: TextOutput | null = null;

export function getTextOutput(): TextOutput {
  if (!defaultOutput) {
    defaultOutput = new TextOutput();
  }
  return defaultOutput;
}
