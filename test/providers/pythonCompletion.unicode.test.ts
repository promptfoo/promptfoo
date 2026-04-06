import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import * as pythonUtils from '../../src/python/pythonUtils';

import type { CallApiContextParams } from '../../src/types/index';

// Windows CI has severe filesystem delays (antivirus, etc.) - allow up to 90s
// (60s for file retry + 30s for Python startup and test overhead)
const TEST_TIMEOUT = process.platform === 'win32' ? 90000 : 15000;

// Skip on Windows CI due to aggressive file security policies blocking temp file IPC
// Works fine on local Windows and all other platforms
const describeOrSkip = process.platform === 'win32' && process.env.CI ? describe.skip : describe;

describeOrSkip('PythonProvider Unicode handling', () => {
  let tempDir: string;
  let provider: PythonProvider;

  beforeAll(() => {
    // Disable caching for tests to ensure fresh runs
    process.env.PROMPTFOO_CACHE_ENABLED = 'false';
    pythonUtils.state.cachedPythonPath = null;
    pythonUtils.state.validationPromise = null;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-unicode-test-'));

    const scriptPath = path.join(tempDir, 'unicode_test.py');
    fs.writeFileSync(
      scriptPath,
      `
def call_api(prompt, options, context):
    vars = context.get('vars', {}) if context else {}
    if vars.get('mode') == 'nested':
        return {
            "output": "Complex Unicode test",
            "nested": {
                "products": [
                    {"name": "Product®", "price": "€100"},
                    {"name": "Brand™", "price": "€200"},
                    {"name": "Item© 2025", "price": "€300"}
                ],
                "metadata": {
                    "temperature": "25°C",
                    "description": "Advanced Product® with Brand™ technology ©2025"
                }
            }
        }
    if 'product' in vars:
        product_name = vars.get('product', 'Unknown')
        return {
            "output": f"{prompt} - Product: {product_name}",
            "metadata": {
                "product_name": product_name,
                "product_bytes": len(product_name.encode('utf-8'))
            }
        }
    return {
        "output": f"Received: {prompt}",
        "metadata": {
            "prompt_length": len(prompt),
            "prompt_bytes": len(prompt.encode('utf-8'))
        }
    }
`,
    );

    provider = new PythonProvider(scriptPath, {
      id: 'python:unicode_test.py',
      config: { basePath: tempDir },
    });
  });

  afterAll(async () => {
    await provider?.shutdown().catch(() => {});

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it(
    'should correctly handle Unicode characters in prompt',
    async () => {
      const result = await provider.callApi('Product® Plus');

      // Verify the result structure and Unicode preservation
      expect(result.output).toBe('Received: Product® Plus');
      expect(result.metadata?.prompt_length).toBe(13);
      expect(result.metadata?.prompt_bytes).toBe(14);
      expect(result.error).toBeUndefined();

      // Ensure no null bytes in JSON serialization
      const jsonStr = JSON.stringify(result);
      expect(jsonStr).not.toContain('\u0000');
      expect(jsonStr).not.toContain('\\u0000');
      expect(jsonStr).toContain('Product® Plus');
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle Unicode in context vars',
    async () => {
      const context: CallApiContextParams = {
        prompt: { raw: 'Test prompt', label: 'test' },
        vars: {
          product: 'Product® Plus™',
          company: '© 2025 Company',
          price: '€100',
        },
      };

      const result = await provider.callApi('Test prompt', context);

      // Verify Unicode handling in response
      expect(result.output).toBe('Test prompt - Product: Product® Plus™');
      expect(result.metadata?.product_name).toBe('Product® Plus™');
      // Note: ® is 2 bytes, ™ is 3 bytes in UTF-8, so total is 17 bytes
      expect(result.metadata?.product_bytes).toBe(17);
    },
    TEST_TIMEOUT,
  );

  it(
    'should handle complex nested Unicode data',
    async () => {
      const result = await provider.callApi('Test', {
        prompt: { raw: 'Test', label: 'test' },
        vars: { mode: 'nested' },
      });

      // Verify complex nested Unicode structures are preserved
      const resultAny = result as any;
      expect(resultAny.nested.products[0].name).toBe('Product®');
      expect(resultAny.nested.products[1].name).toBe('Brand™');
      expect(resultAny.nested.products[2].name).toBe('Item© 2025');
      expect(resultAny.nested.metadata.temperature).toBe('25°C');
      expect(resultAny.nested.metadata.description).toBe(
        'Advanced Product® with Brand™ technology ©2025',
      );

      // Ensure nested Unicode data serializes properly
      const jsonStr = JSON.stringify(result);
      expect(jsonStr).toContain('Product®');
      expect(jsonStr).toContain('Brand™');
      expect(jsonStr).toContain('€100');
      expect(jsonStr).toContain('25°C');
      expect(jsonStr).not.toContain('\u0000');
    },
    TEST_TIMEOUT,
  );
});
