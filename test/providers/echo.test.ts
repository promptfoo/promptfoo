import { EchoProvider } from '../../src/providers/echo';

describe('EchoProvider', () => {
  describe('constructor', () => {
    it('should initialize with default options', () => {
      const provider = new EchoProvider();
      expect(provider['options']).toEqual({});
      expect(provider.label).toBeUndefined();
      expect(provider.config).toBeUndefined();
      expect(provider.delay).toBeUndefined();
    });

    it('should initialize with provided options', () => {
      const options = {
        config: { test: 'value' },
        label: 'Test Echo',
        delay: 100,
        transform: 'return { output: input.toUpperCase() };',
      };
      const provider = new EchoProvider(options);
      expect(provider).toEqual(
        expect.objectContaining({
          options,
          label: 'Test Echo',
          config: { test: 'value' },
          delay: 100,
        }),
      );
    });

    it('should initialize with id function if id is provided', () => {
      const options = { id: 'custom-echo' };
      const provider = new EchoProvider(options);
      expect(provider.id()).toBe('custom-echo');
    });
  });

  describe('id', () => {
    it('should return the default id string', () => {
      const provider = new EchoProvider();
      expect(provider.id()).toBe('echo');
    });
  });

  describe('toString', () => {
    it('should return the correct string representation', () => {
      const provider = new EchoProvider();
      expect(provider.toString()).toBe('[Echo Provider]');
    });
  });

  describe('callApi', () => {
    it('should return input as output', async () => {
      const input = 'Test input';
      const provider = new EchoProvider();
      const result = await provider.callApi(input);

      expect(result.output).toBe(input);
      expect(result.raw).toBe(input);
    });

    it('should include tokenUsage data in response', async () => {
      const input = 'Test input';
      const provider = new EchoProvider();
      const result = await provider.callApi(input);

      expect(result.tokenUsage).toEqual({
        total: 0,
        prompt: 0,
        completion: 0,
      });
    });

    it('should set cost to 0', async () => {
      const input = 'Test input';
      const provider = new EchoProvider();
      const result = await provider.callApi(input);

      expect(result.cost).toBe(0);
    });

    it('should set cached to false', async () => {
      const input = 'Test input';
      const provider = new EchoProvider();
      const result = await provider.callApi(input);

      expect(result.cached).toBe(false);
    });

    it('should set isRefusal to false', async () => {
      const input = 'Test input';
      const provider = new EchoProvider();
      const result = await provider.callApi(input);

      expect(result.isRefusal).toBe(false);
    });

    it('should preserve context metadata', async () => {
      const input = 'Test input';
      const context = { metadata: { test: 'value' } };
      const provider = new EchoProvider();
      const result = await provider.callApi(input, {}, context);

      expect(result.metadata).toEqual({
        test: 'value',
      });
    });

    it('should respect the configured delay', async () => {
      const input = 'Test input';
      const provider = new EchoProvider({ delay: 100 });

      const startTime = Date.now();
      await provider.callApi(input);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(90); // Allow for small timing variations
    });

    it('should handle empty input', async () => {
      const input = '';
      const provider = new EchoProvider();
      const result = await provider.callApi(input);

      expect(result.output).toBe('');
      expect(result.raw).toBe('');
    });
  });
});
