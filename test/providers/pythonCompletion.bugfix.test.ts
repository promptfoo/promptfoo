import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PythonProvider } from '../../src/providers/pythonCompletion';

describe('PythonProvider Unicode bug #5106 fix verification', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-bugfix-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should not corrupt registered trademark symbol in red team scenarios', async () => {
    // This test verifies the exact bug reported in issue #5106
    const pythonScript = `
def call_api(prompt, options, context):
    # Simulate what happens in red team evaluation
    vars = context.get('vars', {})
    injected = vars.get('injectedContent', '')
    
    # Build the exact structure that gets stored in eval_results table
    return {
        "output": f"Response to: {injected}",
        "test_case": {
            "vars": {"product": injected},
            "metadata": {"original": injected}
        },
        "response": {
            "output": f"Model output about {injected}"
        },
        "grading_result": {
            "pass": False,
            "reason": f"Model responded to {injected}",
            "comment": f"The model discussed {injected}"
        },
        "metadata": {
            "product_name": injected,
            "test_scenario": "red_team_goat"
        },
        "prompt": f"Tell me about {injected}",
        "named_scores": {
            "security": 0.0,
            "contains_product": 1.0 if "Product®" in injected else 0.0
        }
    }
`;
    const scriptPath = path.join(tempDir, 'bug5106_test.py');
    fs.writeFileSync(scriptPath, pythonScript);

    const provider = new PythonProvider(scriptPath, {
      id: 'python:bug5106-test',
      config: { basePath: tempDir },
    });

    // Test the exact case from the bug report
    const context = {
      vars: {
        injectedContent: 'Product® Plus',
      },
    };

    const result = await provider.callApi('Initial prompt', context);

    // Verify no corruption occurred
    expect(result.output).toBe('Response to: Product® Plus');
    expect(result.test_case.vars.product).toBe('Product® Plus');
    expect(result.response.output).toBe('Model output about Product® Plus');
    expect(result.grading_result.reason).toBe('Model responded to Product® Plus');
    expect(result.metadata.product_name).toBe('Product® Plus');
    expect(result.prompt).toBe('Tell me about Product® Plus');
    expect(result.named_scores.contains_product).toBe(1.0);

    // Most importantly: ensure no null bytes in the entire JSON
    const jsonStr = JSON.stringify(result);
    expect(jsonStr).not.toContain('\u0000');
    expect(jsonStr).not.toContain('\\u0000');
    expect(jsonStr).toContain('Product® Plus');
  });

  it('should handle all Unicode patterns from the bug report', async () => {
    const pythonScript = `
def call_api(prompt, options, context):
    # Return complex nested structure with all Unicode patterns
    return {
        "output": "Test complete",
        "nested_data": {
            "products": [
                "Product® Plus",
                "Brand™ Solution",
                "Enterprise© 2025",
                "TempControl 25°C",
                "Price €1000"
            ],
            "metadata": {
                "all_symbols": "® ™ © ° €",
                "description": "Product® with Brand™ technology ©2025 at 25°C for €1000"
            }
        }
    }
`;
    const scriptPath = path.join(tempDir, 'all_unicode_test.py');
    fs.writeFileSync(scriptPath, pythonScript);

    const provider = new PythonProvider(scriptPath, {
      id: 'python:all-unicode-test',
      config: { basePath: tempDir },
    });

    const result = await provider.callApi('Test');

    // Verify all symbols are preserved
    expect(result.nested_data.products).toEqual([
      'Product® Plus',
      'Brand™ Solution',
      'Enterprise© 2025',
      'TempControl 25°C',
      'Price €1000',
    ]);
    expect(result.nested_data.metadata.all_symbols).toBe('® ™ © ° €');
    expect(result.nested_data.metadata.description).toBe(
      'Product® with Brand™ technology ©2025 at 25°C for €1000'
    );
  });
});