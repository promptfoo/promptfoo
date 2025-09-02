import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import type { CallApiContextParams } from '../../src/types';

describe('PythonProvider Unicode handling', () => {
  let tempDir: string;

  beforeAll(() => {
    // Disable caching for tests to ensure fresh runs
    process.env.PROMPTFOO_CACHE_ENABLED = 'false';
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-unicode-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  // Helper to create a provider with less overhead
  const createProvider = (scriptName: string, scriptContent: string) => {
    const scriptPath = path.join(tempDir, scriptName);
    fs.writeFileSync(scriptPath, scriptContent);
    return new PythonProvider(scriptPath, {
      id: `python:${scriptName}`,
      config: { basePath: tempDir },
    });
  };

  it('should correctly handle Unicode characters in prompt', async () => {
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
    expect(result.output).toBe('Received: Product® Plus');
    expect(result.metadata?.prompt_length).toBe(13);
    expect(result.metadata?.prompt_bytes).toBe(14); // ® is 2 bytes in UTF-8
    expect(result.error).toBeUndefined();

    // Ensure no null bytes in JSON serialization
    const jsonStr = JSON.stringify(result);
    expect(jsonStr).not.toContain('\u0000');
    expect(jsonStr).not.toContain('\\u0000');
    expect(jsonStr).toContain('Product® Plus');
  });

  it('should handle Unicode in context vars', async () => {
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
    expect(result.output).toBe('Test prompt - Product: Product® Plus™');
    expect(result.metadata?.product_name).toBe('Product® Plus™');
  });

  it('should handle complex nested Unicode data', async () => {
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
    const resultAny = result as any;
    expect(resultAny.nested.products[0].name).toBe('Product®');
    expect(resultAny.nested.products[1].name).toBe('Brand™');
    expect(resultAny.nested.products[2].name).toBe('Item© 2025');
    expect(resultAny.nested.metadata.temperature).toBe('25°C');
    expect(resultAny.nested.metadata.description).toBe(
      'Advanced Product® with Brand™ technology ©2025',
    );
  });
});