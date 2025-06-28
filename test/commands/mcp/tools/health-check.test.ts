import { HealthCheckTool } from '../../../../src/commands/mcp/tools/system/health-check';

describe('HealthCheckTool', () => {
  let healthCheckTool: HealthCheckTool;
  let mockServer: any;

  beforeEach(() => {
    healthCheckTool = new HealthCheckTool();
    mockServer = {
      tool: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('basic properties', () => {
    it('should have correct name and description', () => {
      expect(healthCheckTool.name).toBe('promptfoo_health_check');
      expect(healthCheckTool.description).toBe('Check server health and system status');
    });
  });

  describe('registration', () => {
    it('should register with MCP server', () => {
      healthCheckTool.register(mockServer);

      expect(mockServer.tool).toHaveBeenCalledWith(
        'promptfoo_health_check',
        { args: expect.any(Object) },
        expect.any(Function),
      );
    });
  });

  describe('execution', () => {
    it('should return health check data successfully', async () => {
      // Mock process properties
      const originalUptime = process.uptime;
      const originalMemoryUsage = process.memoryUsage;

      process.uptime = jest.fn().mockReturnValue(123.456);
      process.memoryUsage = jest.fn().mockReturnValue({
        rss: 1234567,
        heapTotal: 2345678,
        heapUsed: 3456789,
        external: 4567890,
        arrayBuffers: 5678901,
      });

      healthCheckTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);

      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data).toEqual({
        status: 'healthy',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        version: '1.0.0',
        uptime: 123.456,
        memory: {
          rss: 1234567,
          heapTotal: 2345678,
          heapUsed: 3456789,
          external: 4567890,
          arrayBuffers: 5678901,
        },
      });

      // Restore original methods
      process.uptime = originalUptime;
      process.memoryUsage = originalMemoryUsage;
    });

    it('should handle schema validation (empty object is valid)', async () => {
      healthCheckTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
    });

    it('should ignore extra properties in arguments', async () => {
      healthCheckTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({ extraProperty: 'should be ignored' });

      expect(result.isError).toBe(false);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(true);
      expect(parsedContent.data.status).toBe('healthy');
    });

    it('should include timestamp in ISO format', async () => {
      healthCheckTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const beforeTime = new Date().toISOString();
      const result = await toolHandler({});
      const afterTime = new Date().toISOString();

      const parsedContent = JSON.parse(result.content[0].text);
      const timestamp = parsedContent.data.timestamp;

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(timestamp >= beforeTime).toBe(true);
      expect(timestamp <= afterTime).toBe(true);
    });

    it('should include system uptime', async () => {
      healthCheckTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(typeof parsedContent.data.uptime).toBe('number');
      expect(parsedContent.data.uptime >= 0).toBe(true);
    });

    it('should include memory usage information', async () => {
      healthCheckTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      const memory = parsedContent.data.memory;

      expect(memory).toBeDefined();
      expect(typeof memory.rss).toBe('number');
      expect(typeof memory.heapTotal).toBe('number');
      expect(typeof memory.heapUsed).toBe('number');
      expect(typeof memory.external).toBe('number');
      expect(memory.rss > 0).toBe(true);
      expect(memory.heapTotal > 0).toBe(true);
    });

    it('should always return healthy status', async () => {
      healthCheckTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      // Run multiple times to ensure consistency
      for (let i = 0; i < 3; i++) {
        const result = await toolHandler({});
        const parsedContent = JSON.parse(result.content[0].text);

        expect(parsedContent.success).toBe(true);
        expect(parsedContent.data.status).toBe('healthy');
      }
    });

    it('should return consistent version', async () => {
      healthCheckTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.data.version).toBe('1.0.0');
    });
  });

  describe('error handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Mock process.uptime to throw an error
      const originalUptime = process.uptime;
      process.uptime = jest.fn().mockImplementation(() => {
        throw new Error('Process error');
      });

      healthCheckTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Process error');

      // Restore original method
      process.uptime = originalUptime;
    });

    it('should handle memory usage errors', async () => {
      // Mock process.memoryUsage to throw an error
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockImplementation(() => {
        throw new Error('Memory usage error');
      });

      healthCheckTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.success).toBe(false);
      expect(parsedContent.error).toBe('Memory usage error');

      // Restore original method
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('inheritance from AbstractTool', () => {
    it('should use AbstractTool helper methods', async () => {
      healthCheckTool.register(mockServer);
      const toolHandler = mockServer.tool.mock.calls[0][2];

      const result = await toolHandler({});

      // Verify response structure matches AbstractTool pattern
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('isError');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent).toHaveProperty('tool', 'promptfoo_health_check');
      expect(parsedContent).toHaveProperty('success');
      expect(parsedContent).toHaveProperty('timestamp');
    });
  });
}); 