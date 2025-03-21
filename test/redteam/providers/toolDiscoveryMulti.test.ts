import RedteamToolDiscoveryMultiProvider from '../../../src/redteam/providers/toolDiscoveryMulti';

describe('RedteamToolDiscoveryMultiProvider', () => {
  let provider: RedteamToolDiscoveryMultiProvider;

  beforeEach(() => {
    provider = new RedteamToolDiscoveryMultiProvider({});
  });

  describe('extractTools', () => {
    it('should extract tools from numbered lists', () => {
      const response = `
        1. Tool1: A useful tool
        2. Tool2: Another tool
        3. Tool3: Third tool
      `;
      const tools = (provider as any).extractTools(response);
      expect(tools).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('should extract tools from function calls', () => {
      const response = `
        Function call: tool1(args)
        Calling tool2(args)
        execute tool3(args)
        run tool4(args)
      `;
      const tools = (provider as any).extractTools(response);
      expect(tools).toEqual(['tool1']);
    });

    it('should handle non-string input', () => {
      const tools = (provider as any).extractTools({});
      expect(tools).toEqual([]);
    });

    it('should deduplicate tools', () => {
      const response = `
        1. Tool1: First mention
        2. TOOL1: Second mention
        Function call: tool1()
      `;
      const tools = (provider as any).extractTools(response);
      expect(tools).toEqual(['tool1']);
    });

    it('should handle mixed format tool mentions', () => {
      const response = `
        1. Tool1: First tool
        Function call: tool2()
        • Tool3: Third tool
        - Tool4: Fourth tool
      `;
      const tools = (provider as any).extractTools(response);
      expect(tools).toEqual(['tool1', 'tool2']);
    });
  });

  describe('extractParameters', () => {
    it('should extract parameters from function calls with JSON', () => {
      const response = `Call with {"param1": "value1", "param2": "value2"}`;
      const params = (provider as any).extractParameters(response);
      expect(params).toEqual(['param1', 'param2']);
    });

    it('should extract parameters from natural language', () => {
      const response = `
        This function requires a 'name' parameter
        It also needs an "age" input
        The function accepts a location parameter
      `;
      const params = (provider as any).extractParameters(response);
      expect(params).toEqual(['name', 'age', 'location']);
    });

    it('should handle non-string input', () => {
      const params = (provider as any).extractParameters({});
      expect(params).toEqual([]);
    });

    it('should handle invalid JSON', () => {
      const response = `Call with {invalid json}`;
      const params = (provider as any).extractParameters(response);
      expect(params).toEqual([]);
    });

    it('should deduplicate parameters', () => {
      const response = `
        Function requires a "name" parameter
        Also needs a NAME parameter
        {"name": "test", "age": 25}
      `;
      const params = (provider as any).extractParameters(response);
      expect(params).toEqual(['name', 'age']);
    });

    it('should handle multiple JSON objects', () => {
      const response = `
        First call: {"param1": "value1"}
        Second call: {"param2": "value2", "param3": "value3"}
      `;
      const params = (provider as any).extractParameters(response);
      expect(params).toEqual(['param1', 'param2', 'param3']);
    });
  });

  describe('sanitizeForApi', () => {
    it('should handle function call objects', () => {
      const content = {
        type: 'function',
        function: {
          name: 'testFunc',
          arguments: { param1: 'value1' },
        },
      };
      const result = (provider as any).sanitizeForApi(content);
      expect(result).toBe('Function call: testFunc with arguments: {"param1":"value1"}');
    });

    it('should handle array of function calls', () => {
      const content = [
        {
          type: 'function',
          function: {
            name: 'func1',
            arguments: { a: 1 },
          },
        },
        {
          type: 'function',
          function: {
            name: 'func2',
            arguments: { b: 2 },
          },
        },
      ];
      const result = (provider as any).sanitizeForApi(content);
      expect(result).toBe('Function calls: func1({"a":1}), func2({"b":2})');
    });

    it('should handle nested content objects', () => {
      const content = {
        output: {
          text: {
            content: 'nested content',
          },
        },
      };
      const result = (provider as any).sanitizeForApi(content);
      expect(result).toBe('nested content');
    });

    it('should handle strings directly', () => {
      const content = 'plain text';
      const result = (provider as any).sanitizeForApi(content);
      expect(result).toBe('plain text');
    });

    it('should handle malformed function calls', () => {
      const content = {
        type: 'function',
        function: 'invalid',
      };
      const result = (provider as any).sanitizeForApi(content);
      expect(result).toBe(JSON.stringify(content));
    });

    it('should handle empty or undefined content', () => {
      expect((provider as any).sanitizeForApi(undefined)).toBe('Empty content');
      expect((provider as any).sanitizeForApi(null)).toBe('null');
      expect((provider as any).sanitizeForApi('')).toBe('');
    });
  });

  describe('updateToolInfo', () => {
    it('should add new tools', () => {
      const response = '1. Tool1: A tool\n2. Tool2: Another tool';
      (provider as any).updateToolInfo(response);
      expect((provider as any).discoveredTools).toHaveLength(2);
      expect((provider as any).discoveredTools[0].name).toBe('tool1');
      expect((provider as any).discoveredTools[1].name).toBe('tool2');
    });

    it('should update parameters for current tool', () => {
      (provider as any).discoveredTools = [
        {
          name: 'tool1',
          parameters: [],
        },
      ];
      (provider as any).currentToolIndex = 0;
      (provider as any).currentPhase = 1; // PARAMETER_DISCOVERY

      const response = 'The function requires a "param1" parameter and needs a "param2" input';
      (provider as any).updateToolInfo(response);

      expect((provider as any).discoveredTools[0].parameters).toContain('param1');
      expect((provider as any).discoveredTools[0].parameters).toContain('param2');
    });

    it('should handle non-string input', () => {
      const initialTools = [...(provider as any).discoveredTools];
      (provider as any).updateToolInfo({});
      expect((provider as any).discoveredTools).toEqual(initialTools);
    });

    it('should update phase based on discoveries', () => {
      (provider as any).currentPhase = 0; // INITIAL_DISCOVERY
      const response = '1. Tool1: A tool';
      (provider as any).updateToolInfo(response);
      expect((provider as any).currentPhase).toBe(1); // PARAMETER_DISCOVERY
    });

    it('should update description in PARAMETER_DISCOVERY phase', () => {
      (provider as any).discoveredTools = [{ name: 'tool1', parameters: [] }];
      (provider as any).currentToolIndex = 0;
      (provider as any).currentPhase = 1; // PARAMETER_DISCOVERY

      const response = 'This is a tool description';
      (provider as any).updateToolInfo(response);

      expect((provider as any).discoveredTools[0].description).toBe(response);
    });

    it('should update usage in USAGE_ATTEMPT phase', () => {
      (provider as any).discoveredTools = [{ name: 'tool1', parameters: [] }];
      (provider as any).currentToolIndex = 0;
      (provider as any).currentPhase = 2; // USAGE_ATTEMPT

      const response = 'Example usage of the tool';
      (provider as any).updateToolInfo(response);

      expect((provider as any).discoveredTools[0].usage).toBe(response);
    });
  });
});
