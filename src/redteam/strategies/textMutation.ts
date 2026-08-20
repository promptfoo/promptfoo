import { MULTI_INPUT_VAR } from '../constants/plugins';
import { TEXT_MUTATION_DEFAULT_RATES } from '../constants/strategies';

import type { TextMutationStrategy } from '../constants/strategies';
import type { Strategy } from './types';

// Independent implementation based on Unicode character properties and code-point ranges:
// https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-3/
// https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-23/

type RandomSource = () => number;
type StrategyTestCases = Parameters<Strategy['action']>[0];
type TransformableTestCase = Awaited<ReturnType<Strategy['action']>>[number];

const ZERO_WIDTH_CHARACTERS = ['\u200B', '\u200C', '\u200D', '\u2060'] as const;
const WHITESPACE_REPLACEMENTS = ['\t', '\u00A0', '\u2009', '\u200A', '\u202F', '\u3000'] as const;
const COMBINING_MARKS = Array.from({ length: 0x70 }, (_, index) =>
  String.fromCodePoint(0x0300 + index),
).filter((character) => /\p{M}/u.test(character));

const METRIC_SUFFIXES: Record<TextMutationStrategy, string> = {
  'zero-width': 'ZeroWidth',
  'unicode-noise': 'UnicodeNoise',
  zalgo: 'Zalgo',
  'whitespace-obfuscation': 'WhitespaceObfuscation',
  'random-case': 'RandomCase',
};

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: string): RandomSource {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function resolveRate(value: unknown, strategy: TextMutationStrategy): number {
  if (value === undefined) {
    return TEXT_MUTATION_DEFAULT_RATES[strategy];
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${strategy} strategy rate must be a finite number from 0 to 1`);
  }
  return value;
}

function resolveIntensity(value: unknown): number {
  if (value === undefined) {
    return 3;
  }
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 8) {
    throw new Error('zalgo strategy intensity must be an integer from 1 to 8');
  }
  return value as number;
}

function resolveSeed(value: unknown, strategy: TextMutationStrategy, text: string): string {
  if (
    value !== undefined &&
    typeof value !== 'string' &&
    (typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw new Error(`${strategy} strategy seed must be a string or number`);
  }
  return `${value ?? 'promptfoo'}\u0000${strategy}\u0000${text}`;
}

function selectPositions(
  characters: string[],
  rate: number,
  random: RandomSource,
  isEligible: (character: string, index: number) => boolean,
): Set<number> {
  const candidates = characters.flatMap((character, index) =>
    isEligible(character, index) ? [index] : [],
  );
  if (rate === 0 || candidates.length === 0) {
    return new Set();
  }

  const selected = candidates.filter(() => random() < rate);
  if (selected.length === 0) {
    selected.push(candidates[Math.floor(random() * candidates.length)]);
  }
  return new Set(selected);
}

function pick<T>(values: readonly T[], random: RandomSource): T {
  return values[Math.floor(random() * values.length)];
}

function mutateZeroWidth(text: string, rate: number, random: RandomSource): string {
  const characters = Array.from(text);
  const insertionPositions = new Set<number>();

  for (let index = 0; index < characters.length; index++) {
    if (!/[\p{L}\p{N}]/u.test(characters[index])) {
      continue;
    }

    let insertionIndex = index;
    while (
      insertionIndex + 1 < characters.length &&
      /\p{M}/u.test(characters[insertionIndex + 1])
    ) {
      insertionIndex++;
    }
    insertionPositions.add(insertionIndex);
  }

  const selected = selectPositions(characters, rate, random, (_character, index) =>
    insertionPositions.has(index),
  );

  return characters
    .map((character, index) =>
      selected.has(index) ? `${character}${pick(ZERO_WIDTH_CHARACTERS, random)}` : character,
    )
    .join('');
}

function mutateCombiningMarks(
  text: string,
  rate: number,
  intensity: number,
  random: RandomSource,
): string {
  const characters = Array.from(text);
  const selected = selectPositions(characters, rate, random, (character) =>
    /[\p{L}\p{N}]/u.test(character),
  );

  return characters
    .map((character, index) => {
      if (!selected.has(index)) {
        return character;
      }
      const marks = Array.from({ length: intensity }, () => pick(COMBINING_MARKS, random));
      return `${character}${marks.join('')}`;
    })
    .join('');
}

function mutateWhitespace(text: string, rate: number, random: RandomSource): string {
  const characters = Array.from(text);
  const selected = selectPositions(characters, rate, random, (character) =>
    /[\t \f\v\u00A0]/u.test(character),
  );

  return characters
    .map((character, index) => {
      if (!selected.has(index)) {
        return character;
      }
      const replacements = WHITESPACE_REPLACEMENTS.filter((value) => value !== character);
      return pick(replacements, random);
    })
    .join('');
}

function mutateRandomCase(text: string, rate: number, random: RandomSource): string {
  const characters = Array.from(text);
  const selected = selectPositions(characters, rate, random, (character) =>
    /[A-Za-z]/.test(character),
  );

  const mutated = characters.map((character, index) => {
    if (!selected.has(index)) {
      return character;
    }
    return random() < 0.5 ? character.toLowerCase() : character.toUpperCase();
  });

  if (selected.size > 0 && mutated.join('') === text) {
    const fallbackIndex = selected.values().next().value as number;
    const character = mutated[fallbackIndex];
    mutated[fallbackIndex] =
      character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase();
  }

  return mutated.join('');
}

export function mutateText(
  text: string,
  strategy: TextMutationStrategy,
  config: Record<string, unknown> = {},
): string {
  const rate = resolveRate(config.rate, strategy);
  const random = createSeededRandom(resolveSeed(config.seed, strategy, text));

  switch (strategy) {
    case 'zero-width':
      return mutateZeroWidth(text, rate, random);
    case 'unicode-noise':
      return mutateCombiningMarks(text, rate, 1, random);
    case 'zalgo':
      return mutateCombiningMarks(text, rate, resolveIntensity(config.intensity), random);
    case 'whitespace-obfuscation':
      return mutateWhitespace(text, rate, random);
    case 'random-case':
      return mutateRandomCase(text, rate, random);
  }
}

export function transformStrategyInput(
  testCase: TransformableTestCase,
  injectVar: string,
  strategy: string,
  transform: (value: string) => string,
): string {
  const originalText = String(testCase.vars?.[injectVar]);
  const inputs = testCase.metadata?.pluginConfig?.inputs;

  if (
    injectVar !== MULTI_INPUT_VAR ||
    !inputs ||
    typeof inputs !== 'object' ||
    Array.isArray(inputs)
  ) {
    return transform(originalText);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(originalText);
  } catch {
    throw new Error(`${strategy} strategy requires a valid multi-input JSON object`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${strategy} strategy requires a valid multi-input JSON object`);
  }

  const definitions = inputs as Record<string, unknown>;
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => {
        const definition = definitions[key];
        const benign =
          typeof definition === 'object' &&
          definition !== null &&
          (definition as { config?: { benign?: boolean } }).config?.benign === true;

        return [
          key,
          Object.prototype.hasOwnProperty.call(definitions, key) &&
          typeof value === 'string' &&
          !benign
            ? transform(value)
            : value,
        ];
      }),
    ),
  );
}

export function addTextMutation(
  testCases: StrategyTestCases,
  injectVar: string,
  strategy: TextMutationStrategy,
  config: Record<string, unknown> = {},
): StrategyTestCases {
  const metricSuffix = METRIC_SUFFIXES[strategy];
  return testCases.map((testCase) => {
    const originalText = String(testCase.vars?.[injectVar]);
    return {
      ...testCase,
      vars: {
        ...testCase.vars,
        [injectVar]: transformStrategyInput(testCase, injectVar, strategy, (value) =>
          mutateText(value, strategy, config),
        ),
      },
      metadata: {
        ...testCase.metadata,
        strategyId: strategy,
        originalText,
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: assertion.metric ? `${assertion.metric}/${metricSuffix}` : assertion.metric,
      })),
    };
  });
}
