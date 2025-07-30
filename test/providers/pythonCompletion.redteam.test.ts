import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PythonProvider } from '../../src/providers/pythonCompletion';

describe('PythonProvider red team Unicode scenarios', () => {
  let tempDir: string;
  let pythonScriptPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-redteam-unicode-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

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
      const context = {
        vars: {
          injection: testCase,
        },
      };

      const result = await provider.callApi('Test red team scenario', context);
      
      // Verify the Unicode is preserved
      expect(result.output).toBe(`Processing request for ${testCase}`);
      expect(result.metadata.original_injection).toBe(testCase);
      expect(result.test_case.product).toBe(testCase);
      expect(result.metadata.contains_unicode).toBe(true);
      
      // Ensure no null bytes in the output
      const jsonStr = JSON.stringify(result);
      expect(jsonStr).not.toContain('\u0000');
      expect(jsonStr).not.toContain('\\u0000');
    }
  });

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
    let conversation = { messages: [], metadata: {} };
    const context1 = { vars: { conversation } };
    const result1 = await provider.callApi('Tell me about Product® Plus', context1);
    expect(result1.output).toContain('Product® Plus is our premium offering');
    expect(result1.conversation.metadata.products_mentioned).toContain('Product® Plus');

    // Second turn - pass the conversation from first turn
    const context2 = { vars: { conversation: result1.conversation } };
    const result2 = await provider.callApi('What about Brand™ features?', context2);
    expect(result2.output).toContain('Brand™ technology is cutting-edge');
    expect(result2.turn_number).toBe(2);

    // Verify conversation history maintains Unicode
    expect(result2.conversation.messages[0].content).toBe('Tell me about Product® Plus');
    expect(result2.conversation.messages[2].content).toBe('What about Brand™ features?');
  });

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
    expect(cleanResult.debug.input_had_corruption).toBe(false);
    expect(cleanResult.debug.corruption_patterns.has_registered).toBe(true);

    // The key insight: the corruption would come from the Node.js side
    // if JSON serialization isn't handling UTF-8 properly
    // Our fix should prevent this from happening
  });
});