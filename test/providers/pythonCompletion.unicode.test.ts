import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import type { CallApiContextParams } from '../../src/types';
import { runPython } from '../../src/python/pythonUtils';

// Mock the expensive Python execution for fast, reliable tests
jest.mock('../../src/python/pythonUtils');
const mockRunPython = jest.mocked(runPython);

describe('PythonProvider Unicode handling', () => {
  let tempDir: string;

  beforeAll(() => {
    // Disable caching for tests to ensure fresh runs
    process.env.PROMPTFOO_CACHE_ENABLED = 'false';
  });

  beforeEach(() => {
    jest.clearAllMocks();
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
    // Mock Python execution to return expected Unicode response
    mockRunPython.mockResolvedValue({
      output: 'Received: Product® Plus',
      metadata: {
        prompt_length: 13,
        prompt_bytes: 14, // ® is 2 bytes in UTF-8
      },
    });

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

    // Verify Unicode string was passed correctly to Python layer
    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('unicode_test.py'),
      'call_api',
      ['Product® Plus', expect.any(Object), undefined],
      { pythonExecutable: undefined },
    );

    // Ensure no null bytes in JSON serialization
    const jsonStr = JSON.stringify(result);
    expect(jsonStr).not.toContain('\u0000');
    expect(jsonStr).not.toContain('\\u0000');
    expect(jsonStr).toContain('Product® Plus');
  });

  it('should handle Unicode in context vars', async () => {
    // Mock Python execution with Unicode context response
    mockRunPython.mockResolvedValue({
      output: 'Test prompt - Product: Product® Plus™',
      metadata: {
        product_name: 'Product® Plus™',
        product_bytes: 16, // Unicode characters in bytes
      },
    });

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

    // Verify Unicode context vars were passed correctly
    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('context_unicode_test.py'),
      'call_api',
      [
        'Test prompt',
        expect.any(Object),
        expect.objectContaining({
          vars: expect.objectContaining({
            product: 'Product® Plus™',
            company: '© 2025 Company',
            price: '€100',
          }),
        }),
      ],
      { pythonExecutable: undefined },
    );
  });

  it('should handle complex nested Unicode data', async () => {
    // Mock complex nested Unicode response
    mockRunPython.mockResolvedValue({
      output: 'Complex Unicode test',
      nested: {
        products: [
          { name: 'Product®', price: '€100' },
          { name: 'Brand™', price: '€200' },
          { name: 'Item© 2025', price: '€300' },
        ],
        metadata: {
          temperature: '25°C',
          description: 'Advanced Product® with Brand™ technology ©2025',
        },
      },
    });

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

    // Verify the prompt was passed through correctly
    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('nested_unicode_test.py'),
      'call_api',
      ['Test', expect.any(Object), undefined],
      { pythonExecutable: undefined },
    );

    // Ensure nested Unicode data serializes properly
    const jsonStr = JSON.stringify(result);
    expect(jsonStr).toContain('Product®');
    expect(jsonStr).toContain('Brand™');
    expect(jsonStr).toContain('€100');
    expect(jsonStr).toContain('25°C');
    expect(jsonStr).not.toContain('\u0000');
  });
});
