/**
 * Nace provider for Drex, nace.ai's decision models. Drex answers the same typed questions
 * (Noul, Score, Choice) over the same `/v1/systemone` protocol as TypeSafe's Jev, so this is
 * the TypeSafe provider pointed at console.nace.ai, plus `images` for Drex Max, the Drex model
 * that reads images alongside the text state.
 *
 * API reference: https://console.nace.ai/docs/drex/guides/drex-max
 */

import fs from 'fs';
import path from 'path';

import cliState from '../cliState';
import { renderVarsInObject } from '../util/index';
import { ellipsize } from '../util/text';
import { isPlainObject, TypeSafeProvider } from './typesafe';

import type {
  SystemOneRequestOptions,
  SystemOneVendor,
  TypeSafeConfig,
  TypeSafeEntry,
  TypeSafeQuestion,
} from './typesafe';

const NACE: SystemOneVendor = {
  prefix: 'nace',
  name: 'Nace',
  model: 'Drex',
  apiKeyEnvVar: 'NACE_API_KEY',
  defaultApiBaseUrl: 'https://console.nace.ai',
  // https://console.nace.ai/docs/drex/reference/pricing: priced per input token, image tokens
  // included; output tokens are free. Drex Max and Drex Max v1.1 are separate served models.
  inputCostPerToken: {
    'drex-max': 0.03 / 1_000_000,
    'drex-max-v1.1': 0.03 / 1_000_000,
    'drex-v2.0': 0.06 / 1_000_000,
  },
};

/** The image types Drex Max reads, by file extension. */
const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export interface NaceConfig extends TypeSafeConfig {
  /**
   * Drex Max only: up to 8 PNG, JPEG, or WebP images, each a file path, a data URL, or base64.
   * Entries are templates rendered with the test vars, so `{{photo}}` sends a `file://` image
   * var. Questions refer to the images as "Image 1", "Image 2", and so on, in list order.
   */
  images?: string[];
}

/** Whether `text` is clean base64 whose bytes start with PNG, JPEG, or WebP magic bytes. */
function isImageBase64(text: string): boolean {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    return false;
  }
  const bytes = Buffer.from(text.slice(0, 16), 'base64');
  const startsWith = (...magic: number[]) => magic.every((byte, i) => bytes[i] === byte);
  return (
    startsWith(0x89, 0x50, 0x4e, 0x47) ||
    startsWith(0xff, 0xd8, 0xff) ||
    (startsWith(0x52, 0x49, 0x46, 0x46) && bytes.subarray(8, 12).toString('latin1') === 'WEBP')
  );
}

/** An inline image as the API takes it: a data URL or base64, read from the file when given a path. */
function toImage(entry: unknown): string {
  if (typeof entry === 'string' && entry.startsWith('data:')) {
    return entry;
  }
  if (typeof entry === 'string' && entry) {
    const filePath = path.resolve(cliState.basePath ?? '', entry.replace(/^file:\/\//, ''));
    const mimeType = IMAGE_MIME_TYPES[path.extname(filePath).toLowerCase()];
    if (mimeType && fs.existsSync(filePath)) {
      return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
    }
    if (isImageBase64(entry)) {
      return entry;
    }
  }
  throw new Error(
    `Nace \`images\` entries must be PNG, JPEG, or WebP file paths, data URLs, or base64, got ${ellipsize(JSON.stringify(entry) ?? String(entry), 80)}`,
  );
}

/** Drex rounds each probability to 4 decimals, so a sum of n of them can be off by n * 5e-5. */
const probabilitySumTolerance = (count: number) => count * 5e-5 + 1e-9;

function isProbabilityDistribution(values: unknown[]): boolean {
  return (
    values.every((value) => isNumberIn(value, 0, 1)) &&
    Math.abs((values as number[]).reduce((sum, value) => sum + value, 0) - 1) <=
      probabilitySumTolerance(values.length)
  );
}

const isNumberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const sameEntries = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Whether `answer` has the fields and bounds Drex returns for `question`'s type. */
function isWellFormedAnswer(question: TypeSafeQuestion, answer: Record<string, unknown>): boolean {
  if (answer.type !== question.type) {
    return false;
  }
  if (answer.confidence !== undefined && !isNumberIn(answer.confidence, 0, 1)) {
    return false;
  }
  switch (question.type) {
    case 'noul':
      return isNumberIn(answer.noul, 0, 1);
    case 'score':
      if (!Array.isArray(question.criteria)) {
        return false;
      }
      if (!isNumberIn(answer.score, 0, question.criteria.length - 1)) {
        return false;
      }
      if (answer.legend !== undefined && !sameEntries(answer.legend, question.criteria)) {
        return false;
      }
      if (answer.probabilities === undefined) {
        return true;
      }
      // Drex keys a Score's probabilities by level position: "0".."n-1".
      return (
        isPlainObject(answer.probabilities) &&
        Object.keys(answer.probabilities).length === question.criteria.length &&
        question.criteria.every((_, index) =>
          Object.prototype.hasOwnProperty.call(answer.probabilities, String(index)),
        ) &&
        isProbabilityDistribution(Object.values(answer.probabilities))
      );
    case 'choice': {
      const { choice, probabilities } = answer;
      if (!isPlainObject(question.criteria) || !isPlainObject(probabilities)) {
        return false;
      }
      const labels = Object.keys(question.criteria);
      const has = (key: string) => Object.prototype.hasOwnProperty.call(probabilities, key);
      const values = Object.values(probabilities);
      return (
        typeof choice === 'string' &&
        labels.includes(choice) &&
        values.length === labels.length &&
        labels.every(has) &&
        isProbabilityDistribution(values)
      );
    }
    default:
      return false;
  }
}

export class NaceProvider extends TypeSafeProvider {
  declare config: NaceConfig;

  protected override get vendor(): SystemOneVendor {
    return NACE;
  }

  /** The environment key is sent only to Nace itself, never to a custom `apiBaseUrl`. */
  override getApiKey(): string | undefined {
    return this.usesCustomHost() ? this.config.apiKey : super.getApiKey();
  }

  protected override missingApiKeyError(): string {
    return this.usesCustomHost()
      ? `Nace \`apiKey\` must be set in the provider config when \`apiBaseUrl\` is not ${NACE.defaultApiBaseUrl}; the ${NACE.apiKeyEnvVar} environment variable is not sent to other hosts.`
      : super.missingApiKeyError();
  }

  private usesCustomHost(): boolean {
    const { apiBaseUrl } = this.config;
    if (!apiBaseUrl) {
      return false;
    }
    try {
      return new URL(apiBaseUrl).origin !== NACE.defaultApiBaseUrl;
    } catch {
      return true;
    }
  }

  /** Reject answers outside their type's fields and bounds, so assertions never see them. */
  protected override isValidAnswer(
    question: TypeSafeQuestion,
    answer: Record<string, unknown>,
  ): boolean {
    return isWellFormedAnswer(question, answer);
  }

  /** Drex reports errors as `{error: {message, issues?: [{path, message}]}}`. */
  protected override formatErrorDetail(data: unknown): string {
    const error = isPlainObject(data) && isPlainObject(data.error) ? data.error : data;
    const issues = isPlainObject(error) && Array.isArray(error.issues) ? error.issues : [];
    if (issues.length > 0) {
      return issues
        .map((issue) => {
          if (!isPlainObject(issue) || typeof issue.message !== 'string') {
            return JSON.stringify(issue);
          }
          return issue.path ? `${issue.path}: ${issue.message}` : issue.message;
        })
        .join('; ');
    }
    return super.formatErrorDetail(error);
  }

  /**
   * Drex takes rubrics and levels as strings only. Keep text that happens to hold JSON as text
   * instead of parsing it into structure, and reject real objects here rather than with a 422.
   */
  protected override instructionEntry(value: unknown): TypeSafeEntry {
    if (typeof value !== 'string') {
      throw new Error(
        `Nace rubrics and \`levels\` must be strings, got ${ellipsize(JSON.stringify(value) ?? String(value), 80)}`,
      );
    }
    return value;
  }

  protected override requestBody(
    state: TypeSafeEntry,
    questions: Record<string, TypeSafeQuestion>,
    request: SystemOneRequestOptions,
  ): Record<string, unknown> {
    const body = super.requestBody(state, questions, request);
    const { images } = request.config as NaceConfig;
    if (images !== undefined && !Array.isArray(images)) {
      throw new Error(
        'Nace `images` must be a list of image file paths, data URLs, or base64 strings.',
      );
    }
    if (!images?.length) {
      return body;
    }
    return { ...body, images: renderVarsInObject(images, request.vars).map(toImage) };
  }
}
