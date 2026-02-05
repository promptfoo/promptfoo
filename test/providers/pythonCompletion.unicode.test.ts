import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  const providers: PythonProvider[] = [];

  beforeAll(() => {
    // Disable caching for tests to ensure fresh runs
    process.env.PROMPTFOO_CACHE_ENABLED = 'false';
  });

  beforeEach(() => {
    // Reset Python state to avoid test interference
    pythonUtils.state.cachedPythonPath = null;
    pythonUtils.state.validationPromise = null;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-unicode-test-'));
  });

  afterEach(async () => {
    // Cleanup providers
    await Promise.all(providers.map((p) => p.shutdown().catch(() => {})));
    providers.length = 0;

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  afterAll(async () => {
    // Final cleanup
    await Promise.all(providers.map((p) => p.shutdown().catch(() => {})));
  });

  // Helper to create a provider with less overhead
  const createProvider = (scriptName: string, scriptContent: string) => {
    const scriptPath = path.join(tempDir, scriptName);
    fs.writeFileSync(scriptPath, scriptContent);
    const provider = new PythonProvider(scriptPath, {
      id: `python:${scriptName}`,
      config: { basePath: tempDir },
    });
    providers.push(provider);
    return provider;
  };

  it(
    'should correctly handle Unicode characters in prompt',
    async () => {
      const provider = createProvider(
        'unicode_test.py',
        `
def call_api(prompt, options, context):
    return {
        "output": f"Received: {prompt}",
        "metadata": {
            "prompt_length": len(prompt),
            "prompt_bytes": len(prompt.encode('utf-8'))
        }
    }
`,
      );

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
      const provider = createProvider(
        'context_unicode_test.py',
        `
def call_api(prompt, options, context):
    vars = context.get('vars', {})
    product_name = vars.get('product', 'Unknown')
    return {
        "output": f"{prompt} - Product: {product_name}",
        "metadata": {
            "product_name": product_name,
            "product_bytes": len(product_name.encode('utf-8'))
        }
    }
`,
      );

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
      const provider = createProvider(
        'nested_unicode_test.py',
        `
def call_api(prompt, options, context):
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
`,
      );

      const result = await provider.callApi('Test');

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
