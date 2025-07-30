import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PythonProvider } from '../../src/providers/pythonCompletion';

describe('PythonProvider Unicode corruption scenarios', () => {
  let tempDir: string;
  let pythonScriptPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-corruption-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

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
    expect(result.raw_data.valid_unicode).toBe('Product® Plus™');
    expect(result.raw_data.high_unicode).toBe('🚀 Emoji test');
    expect(result.raw_data.chinese).toBe('中文测试');
    expect(result.raw_data.mixed).toBe('Product® with 中文 and 🚀');
  });

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
    expect(result.debug.all_equal).toBe(true);
  });

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
    expect(result.output).toBe('®');
    expect(result.verify_roundtrip).toBe(true);
    expect(result.encoding_methods.decoded_utf8).toBe('®');
  });

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
    expect(result.both_equal).toBe(true);
    expect(result.original_preserved).toBe(true);
    expect(result.ascii_parsed).toBe('Product® Plus™');
    expect(result.utf8_parsed).toBe('Product® Plus™');
    // ASCII version should have escaped Unicode
    expect(result.ascii_version).toContain('\\u');
    // UTF-8 version should have actual Unicode characters
    expect(result.utf8_version).toContain('®');
  });
});