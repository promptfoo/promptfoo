import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import type { CallApiContextParams } from '../../src/types';
import { state as pythonUtilsState } from '../../src/python/pythonUtils';

describe('PythonProvider Unicode handling', () => {
  let tempDir: string;
  let pythonScriptPath: string;

  beforeAll(() => {
    // Cache the Python path validation to avoid repeated subprocess calls
    pythonUtilsState.cachedPythonPath = 'python';
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

  describe('Basic Unicode handling', () => {
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

      // Test only the most critical Unicode cases to reduce test time
      const testCases = [
        { input: 'Product® Plus', expected: 'Product® Plus' },
        { input: 'Brand™ Name', expected: 'Brand™ Name' },
        { input: 'Emoji test 🚀', expected: 'Emoji test 🚀' },
        { input: 'Mixed: Product® Brand™ €100', expected: 'Mixed: Product® Brand™ €100' },
      ];

      // Run test cases in parallel for better performance
      const results = await Promise.all(testCases.map(({ input }) => provider.callApi(input)));

      results.forEach((result, index) => {
        const { expected } = testCases[index];
        expect(result.output).toBe(`Received: ${expected}`);
        expect(result.error).toBeUndefined();
      });
    }, 10000);

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
    }, 10000);

    it('should handle Unicode in provider output', async () => {
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
    }, 10000);

    it('should handle complex nested Unicode data', async () => {
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
      const resultAny = result as any;
      expect(resultAny.nested.products[0].name).toBe('Product®');
      expect(resultAny.nested.products[1].name).toBe('Brand™');
      expect(resultAny.nested.products[2].name).toBe('Item© 2025');
      expect(resultAny.nested.metadata.temperature).toBe('25°C');
      expect(resultAny.nested.metadata.description).toBe(
        'Advanced Product® with Brand™ technology ©2025',
      );
    }, 10000);

    it('should detect and report Unicode corruption', async () => {
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
      expect((result as any).debug.original).toBe('Product® Plus');
    }, 10000);
  });

  describe('Bug #5106 fix verification', () => {
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
      const context: CallApiContextParams = {
        prompt: { raw: 'Initial prompt', label: 'test' },
        vars: {
          injectedContent: 'Product® Plus',
        },
      };

      const result = await provider.callApi('Initial prompt', context);

      // Verify no corruption occurred
      expect(result.output).toBe('Response to: Product® Plus');
      // Check nested properties that Python added
      const resultAny = result as any;
      expect(resultAny.test_case.vars.product).toBe('Product® Plus');
      expect(resultAny.response.output).toBe('Model output about Product® Plus');
      expect(resultAny.grading_result.reason).toBe('Model responded to Product® Plus');
      expect(result.metadata?.product_name).toBe('Product® Plus');
      expect(resultAny.prompt).toBe('Tell me about Product® Plus');
      expect(resultAny.named_scores.contains_product).toBe(1.0);

      // Most importantly: ensure no null bytes in the entire JSON
      const jsonStr = JSON.stringify(result);
      expect(jsonStr).not.toContain('\u0000');
      expect(jsonStr).not.toContain('\\u0000');
      expect(jsonStr).toContain('Product® Plus');
    }, 10000);

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
      const resultAny = result as any;
      expect(resultAny.nested_data.products).toEqual([
        'Product® Plus',
        'Brand™ Solution',
        'Enterprise© 2025',
        'TempControl 25°C',
        'Price €1000',
      ]);
      expect(resultAny.nested_data.metadata.all_symbols).toBe('® ™ © ° €');
      expect(resultAny.nested_data.metadata.description).toBe(
        'Product® with Brand™ technology ©2025 at 25°C for €1000',
      );
    }, 10000);
  });

  describe('Unicode corruption scenarios', () => {
    it('should handle malformed UTF-8 sequences gracefully', async () => {
      // Create a Python script that tries to create invalid UTF-8
      const pythonScript = `
import json

def call_api(prompt, options, context):
    # Test various edge cases that might cause corruption
    test_cases = {
        "valid_unicode": "Product® Plus™",
        "high_unicode": "🚀 Emoji test",
        "chinese": "中文测试",
        "mixed": "Product® with 中文 and 🚀",
    }
    
    # Ensure proper encoding
    for key, value in test_cases.items():
        # This will raise if encoding fails
        _ = value.encode('utf-8')
    
    return {
        "output": json.dumps(test_cases, ensure_ascii=False),
        "raw_data": test_cases
    }
`;
      pythonScriptPath = path.join(tempDir, 'malformed_test.py');
      fs.writeFileSync(pythonScriptPath, pythonScript);

      const provider = new PythonProvider(pythonScriptPath, {
        id: 'python:malformed-test',
        config: { basePath: tempDir },
      });

      const result = await provider.callApi('Test');
      const resultAny = result as any;
      expect(resultAny.raw_data.valid_unicode).toBe('Product® Plus™');
      expect(resultAny.raw_data.high_unicode).toBe('🚀 Emoji test');
      expect(resultAny.raw_data.chinese).toBe('中文测试');
      expect(resultAny.raw_data.mixed).toBe('Product® with 中文 and 🚀');
    }, 10000);

    it('should preserve Unicode through JSON roundtrip', async () => {
      // Test that mimics what happens in red team scenarios
      const pythonScript = `
import json

def call_api(prompt, options, context):
    # Simulate multiple JSON encoding/decoding cycles
    original = "Product® Plus™ €100 25°C"
    
    # First cycle - like storing in database
    json_str1 = json.dumps({"text": original}, ensure_ascii=False)
    parsed1 = json.loads(json_str1)
    
    # Second cycle - like retrieving and re-encoding
    json_str2 = json.dumps(parsed1, ensure_ascii=False)
    parsed2 = json.loads(json_str2)
    
    # Third cycle - like sharing/uploading
    json_str3 = json.dumps(parsed2, ensure_ascii=False)
    parsed3 = json.loads(json_str3)
    
    return {
        "output": parsed3["text"],
        "debug": {
            "original": original,
            "after_cycle1": parsed1["text"],
            "after_cycle2": parsed2["text"],
            "after_cycle3": parsed3["text"],
            "all_equal": all([
                original == parsed1["text"],
                original == parsed2["text"],
                original == parsed3["text"]
            ])
        }
    }
`;
      pythonScriptPath = path.join(tempDir, 'roundtrip_test.py');
      fs.writeFileSync(pythonScriptPath, pythonScript);

      const provider = new PythonProvider(pythonScriptPath, {
        id: 'python:roundtrip-test',
        config: { basePath: tempDir },
      });

      const result = await provider.callApi('Test');
      expect(result.output).toBe('Product® Plus™ €100 25°C');
      expect((result as any).debug.all_equal).toBe(true);
    }, 10000);

    it('should handle binary data that looks like Unicode', async () => {
      // Test edge case where binary data might be misinterpreted
      const pythonScript = `
import json
import base64

def call_api(prompt, options, context):
    # Create some binary data that includes UTF-8-like sequences
    binary_data = b'\\xc2\\xae'  # This is ® in UTF-8
    
    # Different ways to handle binary data
    results = {
        "decoded_utf8": binary_data.decode('utf-8'),
        "base64_encoded": base64.b64encode(binary_data).decode('ascii'),
        "hex_encoded": binary_data.hex(),
        "raw_bytes_list": list(binary_data),
    }
    
    # Test that we can round-trip through JSON
    json_str = json.dumps(results, ensure_ascii=False)
    parsed = json.loads(json_str)
    
    return {
        "output": parsed["decoded_utf8"],
        "encoding_methods": parsed,
        "verify_roundtrip": parsed["decoded_utf8"] == "®"
    }
`;
      pythonScriptPath = path.join(tempDir, 'binary_test.py');
      fs.writeFileSync(pythonScriptPath, pythonScript);

      const provider = new PythonProvider(pythonScriptPath, {
        id: 'python:binary-test',
        config: { basePath: tempDir },
      });

      const result = await provider.callApi('Test');
      const resultAny = result as any;
      expect(result.output).toBe('®');
      expect(resultAny.verify_roundtrip).toBe(true);
      expect(resultAny.encoding_methods.decoded_utf8).toBe('®');
    }, 10000);

    it('should detect when ensure_ascii causes issues', async () => {
      // Test the difference between ensure_ascii True/False
      const pythonScript = `
import json

def call_api(prompt, options, context):
    test_string = "Product® Plus™"
    
    # Compare different JSON encoding options
    ascii_encoded = json.dumps({"text": test_string}, ensure_ascii=True)
    utf8_encoded = json.dumps({"text": test_string}, ensure_ascii=False)
    
    # Parse both back
    ascii_parsed = json.loads(ascii_encoded)
    utf8_parsed = json.loads(utf8_encoded)
    
    return {
        "output": "Encoding comparison complete",
        "ascii_version": ascii_encoded,
        "utf8_version": utf8_encoded,
        "ascii_parsed": ascii_parsed["text"],
        "utf8_parsed": utf8_parsed["text"],
        "both_equal": ascii_parsed["text"] == utf8_parsed["text"],
        "original_preserved": (
            ascii_parsed["text"] == test_string and 
            utf8_parsed["text"] == test_string
        )
    }
`;
      pythonScriptPath = path.join(tempDir, 'ensure_ascii_test.py');
      fs.writeFileSync(pythonScriptPath, pythonScript);

      const provider = new PythonProvider(pythonScriptPath, {
        id: 'python:ensure-ascii-test',
        config: { basePath: tempDir },
      });

      const result = await provider.callApi('Test');
      const resultAny = result as any;
      expect(resultAny.both_equal).toBe(true);
      expect(resultAny.original_preserved).toBe(true);
      expect(resultAny.ascii_parsed).toBe('Product® Plus™');
      expect(resultAny.utf8_parsed).toBe('Product® Plus™');
      // ASCII version should have escaped Unicode
      expect(resultAny.ascii_version).toContain('\\u');
      // UTF-8 version should have actual Unicode characters
      expect(resultAny.utf8_version).toContain('®');
    }, 10000);
  });

  describe('Red team Unicode scenarios', () => {
    it('should handle red team GOAT-style prompts with Unicode', async () => {
      // Simulate a Python provider that might be used in red team testing
      const pythonScript = `
import json

def call_api(prompt, options, context):
    # Simulate processing that happens in red team scenarios
    # This mimics what might happen with product names containing Unicode
    
    vars = context.get('vars', {})
    injected_content = vars.get('injection', '')
    
    # Build response that includes Unicode characters
    response = f"Processing request for {injected_content}"
    
    # Add metadata that might be stored in database
    metadata = {
        "original_injection": injected_content,
        "processed": True,
        "contains_unicode": any(ord(c) > 127 for c in injected_content),
        "byte_length": len(injected_content.encode('utf-8')),
        "char_length": len(injected_content)
    }
    
    return {
        "output": response,
        "metadata": metadata,
        "test_case": {
            "product": injected_content,
            "scenario": "red_team_test"
        }
    }
`;
      pythonScriptPath = path.join(tempDir, 'redteam_provider.py');
      fs.writeFileSync(pythonScriptPath, pythonScript);

      const provider = new PythonProvider(pythonScriptPath, {
        id: 'python:redteam-test',
        config: { basePath: tempDir },
      });

      // Test with various Unicode patterns that appear in the bug report
      const testCases = [
        'Product® Plus',
        'Brand™ Solution',
        'Enterprise© 2025',
        'TempControl 25°C',
        'Price €1000',
        'Advanced Product® with Brand™ technology',
      ];

      for (const testCase of testCases) {
        const context: CallApiContextParams = {
          prompt: { raw: 'Test red team scenario', label: 'test' },
          vars: {
            injection: testCase,
          },
        };

        const result = await provider.callApi('Test red team scenario', context);

        // Verify the Unicode is preserved
        expect(result.output).toBe(`Processing request for ${testCase}`);
        expect(result.metadata?.original_injection).toBe(testCase);
        expect((result as any).test_case.product).toBe(testCase);
        expect(result.metadata?.contains_unicode).toBe(true);

        // Ensure no null bytes in the output
        const jsonStr = JSON.stringify(result);
        expect(jsonStr).not.toContain('\u0000');
        expect(jsonStr).not.toContain('\\u0000');
      }
    }, 10000);

    it('should handle multi-turn conversation with Unicode', async () => {
      // Simulate what happens in red team multi-turn scenarios
      // Note: Python providers are stateless between calls, so we simulate state via context
      const pythonScript = `
import json

def call_api(prompt, options, context):
    # Get conversation history from context
    conversation = context.get('vars', {}).get('conversation', {
        "messages": [],
        "metadata": {}
    })
    
    # Add current message to conversation
    conversation["messages"].append({
        "role": "user",
        "content": prompt
    })
    
    # Generate response with Unicode content
    response_text = f"I understand you're asking about {prompt}. "
    if "Product®" in prompt:
        response_text += "Product® Plus is our premium offering. "
    if "Brand™" in prompt:
        response_text += "Brand™ technology is cutting-edge. "
    
    conversation["messages"].append({
        "role": "assistant", 
        "content": response_text
    })
    
    # Store Unicode-rich metadata
    conversation["metadata"]["last_topic"] = prompt
    conversation["metadata"]["products_mentioned"] = [
        "Product® Plus",
        "Brand™ Suite",
        "Enterprise© Solution"
    ]
    
    return {
        "output": response_text,
        "conversation": conversation,
        "turn_number": len(conversation["messages"]) // 2
    }
`;
      pythonScriptPath = path.join(tempDir, 'conversation_provider.py');
      fs.writeFileSync(pythonScriptPath, pythonScript);

      const provider = new PythonProvider(pythonScriptPath, {
        id: 'python:conversation-test',
        config: { basePath: tempDir },
      });

      // First turn
      const conversation = { messages: [], metadata: {} };
      const context1: CallApiContextParams = {
        prompt: { raw: 'Tell me about Product® Plus', label: 'test' },
        vars: { conversation },
      };
      const result1 = await provider.callApi('Tell me about Product® Plus', context1);
      expect(result1.output).toContain('Product® Plus is our premium offering');
      const result1Any = result1 as any;
      expect(result1Any.conversation.metadata.products_mentioned).toContain('Product® Plus');

      // Second turn - pass the conversation from first turn
      const context2: CallApiContextParams = {
        prompt: { raw: 'What about Brand™ features?', label: 'test' },
        vars: { conversation: result1Any.conversation },
      };
      const result2 = await provider.callApi('What about Brand™ features?', context2);
      expect(result2.output).toContain('Brand™ technology is cutting-edge');
      const result2Any = result2 as any;
      expect(result2Any.turn_number).toBe(2);

      // Verify conversation history maintains Unicode
      expect(result2Any.conversation.messages[0].content).toBe('Tell me about Product® Plus');
      expect(result2Any.conversation.messages[2].content).toBe('What about Brand™ features?');
    }, 10000);

    it('should handle the exact corruption pattern from the bug report', async () => {
      // Test the specific corruption pattern: ® becomes \u0000ae
      const pythonScript = `
import json
import re

def call_api(prompt, options, context):
    # Check if the input has already been corrupted
    has_corruption = '\\x00' in prompt or '\\u0000' in repr(prompt)
    
    # Try to detect the corruption pattern
    corruption_patterns = {
        "null_ae": prompt.count('\\x00\\xae') if '\\x00\\xae' in prompt else 0,
        "escaped_null_ae": prompt.count('\\\\u0000ae') if '\\\\u0000ae' in prompt else 0,
        "has_registered": '®' in prompt,
        "has_trademark": '™' in prompt,
        "has_copyright": '©' in prompt
    }
    
    # Clean version (what it should be)
    clean_prompt = prompt
    if has_corruption:
        # Try to fix known corruption patterns
        clean_prompt = clean_prompt.replace('\\x00\\xae', '®')
        clean_prompt = clean_prompt.replace('\\\\u0000ae', '®')
        clean_prompt = clean_prompt.replace('\\x00\\x99', '™')
        clean_prompt = clean_prompt.replace('\\\\u0099', '™')
    
    return {
        "output": clean_prompt,
        "debug": {
            "input_had_corruption": has_corruption,
            "corruption_patterns": corruption_patterns,
            "original_prompt": prompt,
            "clean_prompt": clean_prompt,
            "bytes_original": list(prompt.encode('utf-8', errors='replace')),
            "bytes_clean": list(clean_prompt.encode('utf-8'))
        }
    }
`;
      pythonScriptPath = path.join(tempDir, 'corruption_detector.py');
      fs.writeFileSync(pythonScriptPath, pythonScript);

      const provider = new PythonProvider(pythonScriptPath, {
        id: 'python:corruption-detector',
        config: { basePath: tempDir },
      });

      // Test with clean input
      const cleanResult = await provider.callApi('Product® Plus');
      expect(cleanResult.output).toBe('Product® Plus');
      const cleanResultAny = cleanResult as any;
      expect(cleanResultAny.debug.input_had_corruption).toBe(false);
      expect(cleanResultAny.debug.corruption_patterns.has_registered).toBe(true);

      // The key insight: the corruption would come from the Node.js side
      // if JSON serialization isn't handling UTF-8 properly
      // Our fix should prevent this from happening
    }, 10000);
  });
});
