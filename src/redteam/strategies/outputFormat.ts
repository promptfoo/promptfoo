import invariant from '../../util/invariant';
import { appendMetricSuffix } from './assertions';

import type { TestCase } from '../../types/index';
import type { TransformFunction } from '../../types/transform';

export type OutputFormatAction = 'encode' | 'decode';

function formatDelimiterForInstructions(delimiter: string): string {
  const code = delimiter.charCodeAt(0);
  if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
    return `'\\x${code.toString(16).padStart(2, '0')}'`;
  }
  return `'${delimiter}'`;
}

export abstract class OutputFormatConverter {
  public readonly action: OutputFormatAction;

  constructor(options: { action?: OutputFormatAction } = {}) {
    if (new.target === OutputFormatConverter) {
      throw new TypeError("Can't instantiate abstract class OutputFormatConverter");
    }
    const action = options.action === undefined ? 'encode' : options.action;
    if (action !== 'encode' && action !== 'decode') {
      throw new Error("action must be either 'encode' or 'decode'");
    }
    this.action = action;
  }

  public abstract getFormatInstructions(): string;

  public abstract decodeOutput(text: string): string;

  public convert(prompt: string): string {
    if (this.action === 'encode') {
      const instructions = this.getFormatInstructions();
      return prompt ? `${prompt}\n\n${instructions}` : instructions;
    }
    return this.decodeOutput(prompt);
  }

  public createDecodeTransform(): TransformFunction {
    return (output: unknown) => (typeof output === 'string' ? this.decodeOutput(output) : output);
  }
}

export class CharSplitOutputConverter extends OutputFormatConverter {
  public readonly delimiter: string;
  private readonly decodePatternSource: string;

  constructor(options: { action?: OutputFormatAction; delimiter?: string } = {}) {
    super({ action: options.action });
    const delimiter = options.delimiter === undefined ? '.' : options.delimiter;
    if (
      typeof delimiter !== 'string' ||
      delimiter.length !== 1 ||
      /\s/.test(delimiter) ||
      delimiter === '\x00'
    ) {
      throw new Error('delimiter must be a single non-whitespace character');
    }
    this.delimiter = delimiter;
    const esc = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    this.decodePatternSource = `(${esc}){2}|(?<=\\S)${esc}(?=\\S)`;
  }

  public getFormatInstructions(): string {
    const d = this.delimiter;
    const delim = formatDelimiterForInstructions(d);
    return (
      `Format your response by inserting ${delim} between adjacent letters inside each word, ` +
      `leaving spaces, hyphens, and punctuation unchanged ("Hello co-op." -> "H${d}e${d}l${d}l${d}o c${d}o-o${d}p."). ` +
      'Output only the final formatted response with no other commentary.'
    );
  }

  public decodeOutput(text: string): string {
    return text.replace(new RegExp(this.decodePatternSource, 'g'), (_match, doubled) =>
      doubled ? this.delimiter : '',
    );
  }

  public getInlineDecodeTransform(): string {
    return `typeof output === 'string' ? output.replace(new RegExp(${JSON.stringify(this.decodePatternSource)}, 'g'), (_match, doubled) => (doubled ? ${JSON.stringify(this.delimiter)} : '')) : output`;
  }
}

export function addCharSplit(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any> = {},
): TestCase[] {
  const converter = new CharSplitOutputConverter({
    action: 'encode',
    delimiter: config.delimiter,
  });
  const decodeTransform = converter.getInlineDecodeTransform();

  return testCases.map((testCase) => {
    invariant(
      testCase.vars,
      `Char-split output format: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
    );

    const originalText = String(testCase.vars[injectVar]);
    return {
      ...testCase,
      assert: appendMetricSuffix(testCase, 'CharSplit'),
      vars: {
        ...testCase.vars,
        [injectVar]: converter.convert(originalText),
      },
      options: {
        ...testCase.options,
        transform: decodeTransform,
      },
      metadata: {
        ...testCase.metadata,
        strategyId: 'char-split',
        originalText,
      },
    };
  });
}
