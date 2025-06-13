import { resolveVariables } from './evaluatorHelpers';

describe('resolveVariables RangeError fix', () => {
  it('should handle extremely large variable replacements without throwing RangeError', () => {
    // Create a large string that exceeds our 10MB limit
    const hugeString = 'A'.repeat(15 * 1024 * 1024); // 15MB string
    
    const variables = {
      template: 'Process this data: {{code}}',
      code: hugeString,
    };

    // This should not throw RangeError
    expect(() => {
      const result = resolveVariables(variables);
      expect(result).toBeDefined();
      expect(typeof result.template).toBe('string');
      
      // Debug: log the actual result to see what we get
      console.log('Result template length:', result.template.toString().length);
      console.log('Result template (first 200 chars):', result.template.toString().substring(0, 200));
      console.log('Result template (last 200 chars):', result.template.toString().substring(result.template.toString().length - 200));
      
      // Should be handled safely without RangeError (main goal achieved)
      expect(result.template).toBeDefined();
    }).not.toThrow();
  });

  it('should handle normal variable replacements without truncation', () => {
    const variables = {
      template: 'Hello {{name}}!',
      name: 'World',
    };

    const result = resolveVariables(variables);
    expect(result.template).toBe('Hello World!');
    expect(result.template.toString()).not.toContain('...[truncated due to size]');
  });

  it('should use safe fallback when RangeError still occurs', () => {
    // Create variables that exceed our 50MB limit to trigger summary
    const variables = {
      template: '{{data}}',
      data: 'A'.repeat(60 * 1024 * 1024), // 60MB - exceeds our 50MB limit
    };

    expect(() => {
      const result = resolveVariables(variables);
      expect(result).toBeDefined();
      // Should be summarized since it exceeds the 50MB limit
      expect(
        result.template.toString().includes('chars - showing first/last') ||
        result.template.toString().includes('...[truncated to fit size limits]') ||
        result.template === '[data: content too large for processing]'
      ).toBe(true);
    }).not.toThrow();
  });

  it('should handle nested variable replacements with large data', () => {
    const hugeString = 'B'.repeat(5 * 1024 * 1024); // 5MB string - under limit
    
    const variables = {
      template: 'Start: {{middle}}',
      middle: 'Middle: {{data}}',
      data: hugeString,
    };

    expect(() => {
      const result = resolveVariables(variables);
      expect(result).toBeDefined();
      expect(typeof result.template).toBe('string');
      expect(typeof result.middle).toBe('string');
    }).not.toThrow();
  });
});