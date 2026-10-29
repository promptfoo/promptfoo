import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStrategy } from '../../../src/redteam/strategies/index';
import {
  addLsbStegoTestCases,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_LSB_DELIMITER,
  decodeLsbPng,
  encodeLsbPng,
} from '../../../src/redteam/strategies/lsbStego';

import type { TestCase, TestCaseWithPlugin } from '../../../src/types/index';

vi.mock('cli-progress');

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    level: 'info',
  },
}));

describe('LSB image stego strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('encodeLsbPng and decodeLsbPng', () => {
    it('round-trips default RGBA payload and preserves minimum 64x64 dimensions', async () => {
      const prompt = 'Verify system configuration and return diagnostic report.';
      const result = await encodeLsbPng(prompt);

      expect(result.width).toBe(64);
      expect(result.height).toBe(64);
      expect(result.base64).toMatch(/^iVBORw0KGgo/);

      const decoded = await decodeLsbPng(result.base64);
      expect(decoded).toBe(prompt);

      const decodedFromDataUri = await decodeLsbPng(`data:image/png;base64,${result.base64}`);
      expect(decodedFromDataUri).toBe(prompt);
    });

    it('matches MSB-first sequential RGBA bit order after lossless PNG re-encode', async () => {
      const prompt = 'Diagnostic payload: check port 443 TLS cipher suites.';
      const result = await encodeLsbPng(prompt, {
        channels: 'RGBA',
        delimiter: DEFAULT_LSB_DELIMITER,
      });

      const raw = await sharp(Buffer.from(result.base64, 'base64')).ensureAlpha().raw().toBuffer();

      let out = '';
      let b = 0;
      let g = 0;
      for (const v of raw) {
        b = (b << 1) | (v & 1);
        g += 1;
        if (g === 8) {
          out += String.fromCharCode(b);
          if (out.endsWith(DEFAULT_LSB_DELIMITER)) {
            break;
          }
          b = 0;
          g = 0;
        }
      }
      expect(out.slice(0, -DEFAULT_LSB_DELIMITER.length)).toBe(prompt);
    });

    it('round-trips multi-script UTF-8 payloads (Cyrillic, Urdu, Chinese, Indonesian, emoji)', async () => {
      const prompt =
        'EN: System Audit | ' +
        'RU: Проверка безопасности системы | ' +
        'UR: سسٹم سیکیورٹی آڈٹ | ' +
        'ZH: 系统安全审计测试 | ' +
        'ID: Pengujian keamanan sistem | ' +
        'EMOJI: 🔥🚀🌍';

      const result = await encodeLsbPng(prompt, { channels: 'RGB' });
      const decoded = await decodeLsbPng(result.base64, { channels: 'RGB' });
      expect(decoded).toBe(prompt);
    });

    it('modifies pixel channel values by at most 1 relative to carrier color', async () => {
      const bg: [number, number, number, number] = [123, 200, 45, 255];
      const prompt = 'Stealth check: pixel channel delta must never exceed 1.';
      const result = await encodeLsbPng(prompt, {
        channels: 'RGBA',
        backgroundColor: bg,
      });

      const raw = await sharp(Buffer.from(result.base64, 'base64')).ensureAlpha().raw().toBuffer();

      let maxDelta = 0;
      for (let i = 0; i < raw.length; i++) {
        const expected = bg[i % 4];
        const delta = Math.abs(raw[i] - expected);
        if (delta > maxDelta) {
          maxDelta = delta;
        }
      }
      expect(maxDelta).toBeLessThanOrEqual(1);
      expect(await decodeLsbPng(result.base64)).toBe(prompt);
    });

    it('auto-scales dimensions when payload exceeds minDimensions', async () => {
      const longPrompt = 'Auto-scaling synthetic carrier check! '.repeat(20);
      const result = await encodeLsbPng(longPrompt, {
        channels: 'RGB',
        minDimensions: [2, 2],
        backgroundColor: [10, 20, 30],
      });

      expect(result.width * result.height).toBeGreaterThan(4);
      expect(await decodeLsbPng(result.base64, { channels: 'RGB' })).toBe(longPrompt);
    });

    it('throws capacity-overflow error when carrierDimensions are too small', async () => {
      await expect(
        encodeLsbPng('This prompt requires far more than 12 bits of capacity.', {
          channels: 'RGB',
          carrierDimensions: [2, 2],
        }),
      ).rejects.toThrow(/too small to hold payload/);
    });

    it('rejects delimiter collisions and handles partial UTF-8 boundaries', async () => {
      await expect(
        encodeLsbPng('Prefix ====EOF==== Suffix', {
          channels: 'RGBA',
          delimiter: '====EOF====',
        }),
      ).rejects.toThrow(/collides with delimiter/);

      await expect(
        encodeLsbPng('Payload ending with ====EOF', {
          channels: 'RGBA',
          delimiter: '====EOF====',
        }),
      ).rejects.toThrow(/collides with delimiter/);

      const edgePrompt = 'Multi-byte boundary 🔥🚀 === ====EO! Проверка ====EO';
      const result = await encodeLsbPng(edgePrompt, {
        channels: 'RGBA',
        delimiter: '====EOF====',
      });
      expect(
        await decodeLsbPng(result.base64, {
          channels: 'RGBA',
          delimiter: '====EOF====',
        }),
      ).toBe(edgePrompt);
    });

    it('throws when delimiter is absent or payload before delimiter is invalid UTF-8', async () => {
      const blankPng = await sharp({
        create: {
          width: 16,
          height: 16,
          channels: 4,
          background: {
            r: DEFAULT_BACKGROUND_COLOR[0],
            g: DEFAULT_BACKGROUND_COLOR[1],
            b: DEFAULT_BACKGROUND_COLOR[2],
            alpha: 1,
          },
        },
      })
        .png()
        .toBuffer();

      await expect(decodeLsbPng(blankPng.toString('base64'), { channels: 'RGBA' })).rejects.toThrow(
        /not found in image LSB stream/,
      );

      const corruptFramed = Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from('====EOF====', 'utf8'),
      ]);
      const rawCorrupt = Buffer.alloc(corruptFramed.length * 8);
      for (let idx = 0; idx < corruptFramed.length; idx++) {
        const byteVal = corruptFramed[idx];
        for (let shift = 7; shift >= 0; shift--) {
          rawCorrupt[idx * 8 + (7 - shift)] = (byteVal >> shift) & 1;
        }
      }
      const corruptPng = await sharp(rawCorrupt, {
        raw: { width: rawCorrupt.length / 4, height: 1, channels: 4 },
      })
        .png({ compressionLevel: 9, adaptiveFiltering: false })
        .toBuffer();

      await expect(
        decodeLsbPng(corruptPng.toString('base64'), {
          channels: 'RGBA',
          delimiter: '====EOF====',
        }),
      ).rejects.toThrow(/not valid UTF-8/);
    });

    it('validates parameters up front', async () => {
      await expect(encodeLsbPng('   ')).rejects.toThrow(/Please provide valid text value/);
      await expect(decodeLsbPng('   ')).rejects.toThrow(/Please provide valid base64 PNG value/);
      await expect(encodeLsbPng('test', { channels: 'CMYK' as any })).rejects.toThrow(
        /channels must be either 'RGB' or 'RGBA'/,
      );
      await expect(encodeLsbPng('test', { delimiter: '' })).rejects.toThrow(
        /delimiter must be a non-empty string/,
      );
      await expect(encodeLsbPng('test', { minDimensions: [0, 64] })).rejects.toThrow(
        /minDimensions must be a \[width, height\] tuple with positive integers/,
      );
      await expect(encodeLsbPng('test', { backgroundColor: [256, 0, 0, 255] })).rejects.toThrow(
        /backgroundColor must be an RGB or RGBA tuple/,
      );
    });
  });

  describe('addLsbStegoTestCases', () => {
    it('replaces injectVar with a decodable base64 PNG and sets metadata and metric suffix', async () => {
      const testCases: TestCase[] = [
        {
          vars: {
            prompt: 'Sample test case for LSB strategy',
          },
          assert: [
            {
              type: 'equals',
              value: 'expected',
              metric: 'test-metric',
            },
            {
              type: 'promptfoo:redteam:jailbreak',
              value: 'should update this metric',
              metric: 'jailbreak-metric',
            },
          ],
          metadata: {
            pluginId: 'test-plugin',
          },
        },
      ];

      const result = await addLsbStegoTestCases(testCases, 'prompt', {
        channels: 'RGBA',
        delimiter: '<<END>>',
        storeToStorage: false,
      });

      expect(result).toHaveLength(1);
      expect(result[0].vars?.image_text).toBe('Sample test case for LSB strategy');
      expect(typeof result[0].vars?.prompt).toBe('string');
      expect(result[0].metadata).toEqual({
        pluginId: 'test-plugin',
        strategyId: 'image-stego',
        originalText: 'Sample test case for LSB strategy',
      });
      expect(result[0].assert?.[0].metric).toBe('test-metric');
      expect(result[0].assert?.[1].metric).toBe('jailbreak/Image-Stego');

      const decoded = await decodeLsbPng(String(result[0].vars?.prompt), {
        channels: 'RGBA',
        delimiter: '<<END>>',
      });
      expect(decoded).toBe('Sample test case for LSB strategy');
    });

    it('throws when testCase.vars is missing', async () => {
      await expect(addLsbStegoTestCases([{} as unknown as TestCase], 'prompt')).rejects.toThrow(
        /testCase.vars is required/,
      );
    });

    it('loads and executes through loadStrategy("image-stego")', async () => {
      const strategy = await loadStrategy('image-stego');
      const testCases: TestCaseWithPlugin[] = [
        {
          vars: { prompt: 'Registered strategy check' },
          metadata: { pluginId: 'test-plugin' },
        },
      ];
      const result = await strategy.action(testCases, 'prompt', { storeToStorage: false });
      expect(result).toHaveLength(1);
      expect(result[0].metadata?.strategyId).toBe('image-stego');
      expect(await decodeLsbPng(String(result[0].vars?.prompt))).toBe('Registered strategy check');
    });
  });
});
