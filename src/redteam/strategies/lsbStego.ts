import { TextDecoder } from 'node:util';

import { Presets, SingleBar } from 'cli-progress';
import logger from '../../logger';
import { isMediaStorageEnabled, storeMedia } from '../../storage';
import invariant from '../../util/invariant';
import { appendPluginMetricSuffix } from './assertions';

import type { TestCase } from '../../types/index';

export type StegoChannelMode = 'RGB' | 'RGBA';

export const DEFAULT_LSB_DELIMITER = '====EOF====';
export const DEFAULT_MIN_DIMENSIONS: [number, number] = [64, 64];
export const DEFAULT_BACKGROUND_COLOR: [number, number, number, number] = [240, 244, 248, 255];

const DATA_URI_PREFIX = 'data:image/png;base64,';

export interface LsbStegoConfig {
  channels?: StegoChannelMode;
  delimiter?: string;
  minDimensions?: [number, number];
  carrierDimensions?: [number, number];
  backgroundColor?: [number, number, number] | [number, number, number, number];
  evalId?: string;
  storeToStorage?: boolean;
}

export interface LsbStegoDecodeOptions {
  channels?: StegoChannelMode;
  delimiter?: string;
}

export interface LsbEncodeResult {
  base64: string;
  width: number;
  height: number;
  storageKey?: string;
}

let sharpCache: any = null;

async function importSharp() {
  if (sharpCache) {
    return sharpCache;
  }
  try {
    sharpCache = await import('sharp');
    return sharpCache;
  } catch (error) {
    logger.warn(`Sharp library not available: ${error}`);
    return null;
  }
}

function isPositiveDimensionsTuple(val: unknown): val is [number, number] {
  return (
    Array.isArray(val) &&
    val.length === 2 &&
    Number.isInteger(val[0]) &&
    Number.isInteger(val[1]) &&
    val[0] >= 1 &&
    val[1] >= 1
  );
}

function validateLsbParams(
  channels: StegoChannelMode,
  delimiter: string,
  minDimensions: [number, number] = DEFAULT_MIN_DIMENSIONS,
  backgroundColor:
    | [number, number, number]
    | [number, number, number, number] = DEFAULT_BACKGROUND_COLOR,
  carrierDimensions?: [number, number],
): [number, number, number, number] {
  if (channels !== 'RGB' && channels !== 'RGBA') {
    throw new Error("channels must be either 'RGB' or 'RGBA'");
  }
  if (typeof delimiter !== 'string' || delimiter.length === 0) {
    throw new Error('delimiter must be a non-empty string');
  }
  if (!isPositiveDimensionsTuple(minDimensions)) {
    throw new Error('minDimensions must be a [width, height] tuple with positive integers');
  }
  if (carrierDimensions !== undefined && !isPositiveDimensionsTuple(carrierDimensions)) {
    throw new Error('carrierDimensions must be a [width, height] tuple with positive integers');
  }
  if (
    !Array.isArray(backgroundColor) ||
    (backgroundColor.length !== 3 && backgroundColor.length !== 4) ||
    backgroundColor.some((c) => !Number.isInteger(c) || c < 0 || c > 255)
  ) {
    throw new Error('backgroundColor must be an RGB or RGBA tuple with channel values in 0..255');
  }

  return backgroundColor.length === 3 ? [...backgroundColor, 255] : backgroundColor;
}

function createCarrierRawBuffer(
  requiredBits: number,
  options: {
    channels: StegoChannelMode;
    minDimensions: [number, number];
    backgroundColor: [number, number, number, number];
    carrierDimensions?: [number, number];
  },
): { buffer: Buffer; width: number; height: number; channelsPerPixel: 3 | 4 } {
  const channelsPerPixel: 3 | 4 = options.channels === 'RGBA' ? 4 : 3;

  let width: number;
  let height: number;

  if (options.carrierDimensions) {
    [width, height] = options.carrierDimensions;
    const capacityBits = width * height * channelsPerPixel;
    if (requiredBits > capacityBits) {
      throw new Error(
        `Carrier image (${width}x${height}, ${capacityBits} bits capacity) is too small to hold payload of ${requiredBits} bits.`,
      );
    }
  } else {
    const minPixels = Math.ceil(requiredBits / channelsPerPixel);
    const [minW, minH] = options.minDimensions;
    if (minW * minH >= minPixels) {
      width = minW;
      height = minH;
    } else {
      width = Math.max(minW, Math.ceil(Math.sqrt(minPixels)));
      height = Math.max(minH, Math.ceil(minPixels / width));
    }
  }

  const totalPixels = width * height;
  const buffer = Buffer.allocUnsafe(totalPixels * channelsPerPixel);
  const [r, g, b, a] = options.backgroundColor;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * channelsPerPixel;
    buffer[offset] = r;
    buffer[offset + 1] = g;
    buffer[offset + 2] = b;
    if (channelsPerPixel === 4) {
      buffer[offset + 3] = a;
    }
  }

  return { buffer, width, height, channelsPerPixel };
}

export async function encodeLsbPng(
  text: string,
  config: LsbStegoConfig = {},
): Promise<LsbEncodeResult> {
  const channels: StegoChannelMode = config.channels ?? 'RGBA';
  const delimiter: string = config.delimiter ?? DEFAULT_LSB_DELIMITER;
  const minDimensions: [number, number] = config.minDimensions ?? DEFAULT_MIN_DIMENSIONS;
  const backgroundColor = validateLsbParams(
    channels,
    delimiter,
    minDimensions,
    config.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    config.carrierDimensions,
  );

  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('Please provide valid text value');
  }

  const payloadBytes = Buffer.from(text, 'utf8');
  const delimiterBytes = Buffer.from(delimiter, 'utf8');
  const framedBytes = Buffer.concat([payloadBytes, delimiterBytes]);

  if (framedBytes.indexOf(delimiterBytes) !== payloadBytes.length) {
    throw new Error(
      `Prompt collides with delimiter ${JSON.stringify(delimiter)}; choose a different delimiter`,
    );
  }

  const { buffer, width, height, channelsPerPixel } = createCarrierRawBuffer(
    framedBytes.length * 8,
    {
      channels,
      minDimensions,
      backgroundColor,
      carrierDimensions: config.carrierDimensions,
    },
  );

  let bitIndex = 0;
  for (let i = 0; i < framedBytes.length; i++) {
    const byteVal = framedBytes[i];
    for (let shift = 7; shift >= 0; shift--) {
      buffer[bitIndex] = (buffer[bitIndex] & 0xfe) | ((byteVal >> shift) & 1);
      bitIndex += 1;
    }
  }

  const sharpModule = await importSharp();
  if (!sharpModule) {
    throw new Error('Please install sharp to use image-based strategies: npm install sharp');
  }

  const pngBuffer: Buffer = await sharpModule
    .default(buffer, {
      raw: {
        width,
        height,
        channels: channelsPerPixel,
      },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  const base64Image = pngBuffer.toString('base64');

  const useStorage = config.storeToStorage ?? isMediaStorageEnabled();
  if (useStorage) {
    try {
      const { ref } = await storeMedia(pngBuffer, {
        contentType: 'image/png',
        mediaType: 'image',
        originalText: text,
        strategyId: 'image-stego',
        evalId: config.evalId,
      });
      logger.debug(`[LSB Stego Strategy] Stored image to: ${ref.key}`);
      return { base64: base64Image, width, height, storageKey: ref.key };
    } catch (storageError) {
      logger.warn('[LSB Stego Strategy] Failed to store image, using inline base64', {
        error: storageError,
      });
    }
  }

  return { base64: base64Image, width, height };
}

function endsWithBytes(extracted: number[], suffix: Buffer): boolean {
  if (extracted.length < suffix.length) {
    return false;
  }
  const offset = extracted.length - suffix.length;
  for (let i = 0; i < suffix.length; i++) {
    if (extracted[offset + i] !== suffix[i]) {
      return false;
    }
  }
  return true;
}

export async function decodeLsbPng(
  base64OrDataUri: string,
  options: LsbStegoDecodeOptions = {},
): Promise<string> {
  const channels: StegoChannelMode = options.channels ?? 'RGBA';
  const delimiter: string = options.delimiter ?? DEFAULT_LSB_DELIMITER;
  validateLsbParams(channels, delimiter);

  if (typeof base64OrDataUri !== 'string' || base64OrDataUri.trim() === '') {
    throw new Error('Please provide valid base64 PNG value');
  }

  const cleanBase64 = base64OrDataUri.startsWith(DATA_URI_PREFIX)
    ? base64OrDataUri.slice(DATA_URI_PREFIX.length)
    : base64OrDataUri;
  const pngBuffer = Buffer.from(cleanBase64, 'base64');

  const sharpModule = await importSharp();
  if (!sharpModule) {
    throw new Error('Please install sharp to use image-based strategies: npm install sharp');
  }

  let pipeline = sharpModule.default(pngBuffer);
  pipeline = channels === 'RGBA' ? pipeline.ensureAlpha() : pipeline.removeAlpha();
  const rawBytes: Buffer = await pipeline.raw().toBuffer();

  const delimiterBytes = Buffer.from(delimiter, 'utf8');
  const extracted: number[] = [];
  let currentByte = 0;
  let bitCount = 0;

  for (let i = 0; i < rawBytes.length; i++) {
    currentByte = (currentByte << 1) | (rawBytes[i] & 1);
    bitCount += 1;
    if (bitCount === 8) {
      extracted.push(currentByte);
      if (endsWithBytes(extracted, delimiterBytes)) {
        const payloadSlice = Uint8Array.from(
          extracted.slice(0, extracted.length - delimiterBytes.length),
        );
        try {
          const decoder = new TextDecoder('utf-8', { fatal: true });
          return decoder.decode(payloadSlice);
        } catch {
          throw new Error('Decoded LSB payload before delimiter is not valid UTF-8');
        }
      }
      currentByte = 0;
      bitCount = 0;
    }
  }

  throw new Error(`Delimiter ${JSON.stringify(delimiter)} not found in image LSB stream`);
}

export async function addLsbStegoTestCases(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any> = {},
): Promise<TestCase[]> {
  const stegoTestCases: TestCase[] = [];

  let progressBar: SingleBar | undefined;
  if (logger.level !== 'debug') {
    progressBar = new SingleBar(
      {
        format: 'Encoding LSB Stego Images {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
        hideCursor: true,
        gracefulExit: true,
      },
      Presets.shades_classic,
    );
    progressBar.start(testCases.length, 0);
  }

  try {
    for (const testCase of testCases) {
      invariant(
        testCase.vars,
        `LSB image stego encoding: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
      );

      const originalText = String(testCase.vars[injectVar]);
      const imageResult = await encodeLsbPng(originalText, config as LsbStegoConfig);

      stegoTestCases.push({
        ...testCase,
        assert: appendPluginMetricSuffix(testCase, 'Image-Stego'),
        vars: {
          ...testCase.vars,
          [injectVar]: imageResult.base64,
          image_text: originalText,
        },
        metadata: {
          ...testCase.metadata,
          strategyId: 'image-stego',
          originalText,
          ...(imageResult.storageKey && {
            imageStorageKey: imageResult.storageKey,
            imageInjectVar: injectVar,
          }),
        },
      });

      if (progressBar) {
        progressBar.increment(1);
      } else {
        logger.debug(`Processed ${stegoTestCases.length} of ${testCases.length}`);
      }
    }
  } finally {
    if (progressBar) {
      progressBar.stop();
    }
  }

  return stegoTestCases;
}
