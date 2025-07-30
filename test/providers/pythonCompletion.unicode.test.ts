import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PythonProvider } from '../../src/providers/pythonCompletion';

describe('PythonProvider Unicode handling', () => {
  let tempDir: string;
  let pythonScriptPath: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-unicode-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should correctly handle Unicode characters in prompt', async () => {
    // Create a simple Python script that echoes the input
    const pythonScript = `
def call_api(prompt, options, context):
    return {
        "output": f"Received: {prompt}",
        "metadata": {
            "prompt_length": len(prompt),
            "prompt_bytes": len(prompt.encode('utf-8'))
        }
    }
`;
    pythonScriptPath = path.join(tempDir, 'unicode_test.py');
    fs.writeFileSync(pythonScriptPath, pythonScript);

    const provider = new PythonProvider(pythonScriptPath, {
      id: 'python:unicode-test',
      config: { basePath: tempDir },
    });

    const testCases = [
      { input: 'Product® Plus', expected: 'Product® Plus' },
      { input: 'Brand™ Name', expected: 'Brand™ Name' },
      { input: '© 2025 Company', expected: '© 2025 Company' },
      { input: 'Temperature: 25°C', expected: 'Temperature: 25°C' },
      { input: 'Price: €100', expected: 'Price: €100' },
      { input: 'Emoji test 🚀', expected: 'Emoji test 🚀' },
      { input: '中文测试', expected: '中文测试' },
      { input: 'Mixed: Product® Brand™ ©2025 €100 25°C', expected: 'Mixed: Product® Brand™ ©2025 €100 25°C' },
    ];

    for (const { input, expected } of testCases) {
      const result = await provider.callApi(input);
      expect(result.output).toBe(`Received: ${expected}`);
      expect(result.error).toBeUndefined();
    }
  });

  it('should handle Unicode in context vars', async () => {
    // Create a Python script that uses context vars
    const pythonScript = `
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
`;
    pythonScriptPath = path.join(tempDir, 'context_unicode_test.py');
    fs.writeFileSync(pythonScriptPath, pythonScript);

    const provider = new PythonProvider(pythonScriptPath, {
      id: 'python:context-unicode-test',
      config: { basePath: tempDir },
    });

    const context = {
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

  it('should handle Unicode in provider output', async () => {
    // Create a Python script that returns Unicode in output
    const pythonScript = `
def call_api(prompt, options, context):
    return {
        "output": "Products: Product® Plus™, SuperBrand©, €100 items at 25°C",
        "metadata": {
            "symbols": ["®", "™", "©", "€", "°"],
            "emoji": "🚀",
            "chinese": "中文"
        }
    }
`;
    pythonScriptPath = path.join(tempDir, 'output_unicode_test.py');
    fs.writeFileSync(pythonScriptPath, pythonScript);

    const provider = new PythonProvider(pythonScriptPath, {
      id: 'python:output-unicode-test',
      config: { basePath: tempDir },
    });

    const result = await provider.callApi('Test');
    expect(result.output).toBe('Products: Product® Plus™, SuperBrand©, €100 items at 25°C');
    expect(result.metadata?.symbols).toEqual(['®', '™', '©', '€', '°']);
    expect(result.metadata?.emoji).toBe('🚀');
    expect(result.metadata?.chinese).toBe('中文');
  });

  it('should handle complex nested Unicode data', async () => {
    // Create a Python script that works with nested Unicode data
    const pythonScript = `
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
`;
    pythonScriptPath = path.join(tempDir, 'nested_unicode_test.py');
    fs.writeFileSync(pythonScriptPath, pythonScript);

    const provider = new PythonProvider(pythonScriptPath, {
      id: 'python:nested-unicode-test',
      config: { basePath: tempDir },
    });

    const result = await provider.callApi('Test');
    expect(result.nested.products[0].name).toBe('Product®');
    expect(result.nested.products[1].name).toBe('Brand™');
    expect(result.nested.products[2].name).toBe('Item© 2025');
    expect(result.nested.metadata.temperature).toBe('25°C');
    expect(result.nested.metadata.description).toBe('Advanced Product® with Brand™ technology ©2025');
  });

  it('should detect and report Unicode corruption', async () => {
    // Create a Python script that simulates corruption
    const pythonScript = `
def call_api(prompt, options, context):
    # Simulate what happens with corrupted Unicode
    corrupted = prompt.replace('®', '\\x00\\xae')
    
    return {
        "output": corrupted,
        "debug": {
            "original": prompt,
            "corrupted": corrupted,
            "original_bytes": list(prompt.encode('utf-8')),
            "corrupted_bytes": list(corrupted.encode('utf-8'))
        }
    }
`;
    pythonScriptPath = path.join(tempDir, 'corruption_test.py');
    fs.writeFileSync(pythonScriptPath, pythonScript);

    const provider = new PythonProvider(pythonScriptPath, {
      id: 'python:corruption-test',
      config: { basePath: tempDir },
    });

    const result = await provider.callApi('Product® Plus');
    // The corrupted version should have null byte
    expect(result.output).toContain('\x00\xae');
    expect(result.debug.original).toBe('Product® Plus');
  });
});