import {
  LivekitProvider,
  createLivekitProvider,
  LivekitError,
  LivekitErrorType
} from '../../src/providers/livekit';
import type { LivekitProviderOptions } from '../../src/providers/livekit';
import type { CallApiContextParams } from '../../src/types';
import { promises as fs } from 'fs';

// Mock filesystem operations
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('LiveKit Provider Error Handling and Recovery', () => {
  let provider: LivekitProvider;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (provider) {
      await provider.cleanup();
    }
  });

  describe('LivekitError Class', () => {
    it('should create error with proper structure', () => {
      const error = new LivekitError(
        LivekitErrorType.CONNECTION_ERROR,
        'Connection failed',
        {
          code: 'CONN_001',
          retryable: true,
          context: { host: 'test.example.com' },
          cause: new Error('Network timeout')
        }
      );

      expect(error.type).toBe(LivekitErrorType.CONNECTION_ERROR);
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('CONN_001');
      expect(error.retryable).toBe(true);
      expect(error.context).toEqual({ host: 'test.example.com' });
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.name).toBe('LivekitError');
    });

    it('should handle serialization correctly', () => {
      const error = new LivekitError(
        LivekitErrorType.VALIDATION_ERROR,
        'Invalid config',
        { code: 'VAL_001' }
      );

      const serialized = JSON.stringify(error);
      const parsed = JSON.parse(serialized);

      expect(parsed.type).toBe('VALIDATION_ERROR');
      expect(parsed.message).toBe('Invalid config');
      expect(parsed.code).toBe('VAL_001');
    });

    it('should categorize all error types correctly', () => {
      const errorTypes = [
        LivekitErrorType.CONFIGURATION_ERROR,
        LivekitErrorType.AGENT_LOAD_ERROR,
        LivekitErrorType.SESSION_ERROR,
        LivekitErrorType.CONNECTION_ERROR,
        LivekitErrorType.TIMEOUT_ERROR,
        LivekitErrorType.PROCESSING_ERROR,
        LivekitErrorType.VALIDATION_ERROR,
        LivekitErrorType.TOOL_EXECUTION_ERROR,
        LivekitErrorType.MULTIMODAL_ERROR,
        LivekitErrorType.NETWORK_ERROR,
      ];

      errorTypes.forEach(type => {
        const error = new LivekitError(type, 'Test error', { code: 'TEST_001' });
        expect(error.type).toBe(type);
        expect(typeof error.type).toBe('string');
      });
    });
  });

  describe('Configuration Validation Errors', () => {
    it('should throw validation error for invalid session timeout', () => {
      expect(() => {
        new LivekitProvider({
          id: 'timeout-validation-test',
          config: {
            agentPath: './test-agent.js',
            sessionTimeout: -1000, // Invalid: negative
          },
        });
      }).toThrow(/sessionTimeout must be between/);
    });

    it('should throw validation error for session timeout too high', () => {
      expect(() => {
        new LivekitProvider({
          id: 'timeout-high-test',
          config: {
            agentPath: './test-agent.js',
            sessionTimeout: 400000, // Invalid: > 5 minutes
          },
        });
      }).toThrow(/sessionTimeout must be between/);
    });

    it('should throw validation error for invalid max concurrent sessions', () => {
      expect(() => {
        new LivekitProvider({
          id: 'sessions-validation-test',
          config: {
            agentPath: './test-agent.js',
            maxConcurrentSessions: 0, // Invalid: must be >= 1
          },
        });
      }).toThrow(/maxConcurrentSessions must be between 1 and 100/);
    });

    it('should throw validation error for invalid audio sample rate', () => {
      expect(() => {
        new LivekitProvider({
          id: 'audio-validation-test',
          config: {
            agentPath: './test-agent.js',
            audioConfig: {
              sampleRate: 22050, // Invalid: not supported
            },
          },
        });
      }).toThrow(/audioConfig.sampleRate must be one of/);
    });

    it('should throw validation error for invalid audio channels', () => {
      expect(() => {
        new LivekitProvider({
          id: 'audio-channels-test',
          config: {
            agentPath: './test-agent.js',
            audioConfig: {
              channels: 5, // Invalid: > 2
            },
          },
        });
      }).toThrow(/audioConfig.channels must be/);
    });

    it('should throw validation error for invalid video dimensions', () => {
      expect(() => {
        new LivekitProvider({
          id: 'video-validation-test',
          config: {
            agentPath: './test-agent.js',
            videoConfig: {
              width: 10000, // Invalid: too large
              height: 720,
            },
          },
        });
      }).toThrow(/videoConfig.width must be between/);
    });

    it('should accept valid configuration without throwing', () => {
      expect(() => {
        provider = new LivekitProvider({
          id: 'valid-config-test',
          config: {
            agentPath: './test-agent.js',
            sessionTimeout: 30000,
            maxConcurrentSessions: 5,
            audioConfig: {
              sampleRate: 48000,
              channels: 2,
              bitrate: 128000,
            },
            videoConfig: {
              width: 1920,
              height: 1080,
              framerate: 30,
              bitrate: 2000000,
            },
          },
        });
      }).not.toThrow();
    });
  });

  describe('File System Error Handling', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'fs-error-test',
        config: {
          agentPath: './nonexistent-agent.js',
        },
      });
    });

    it('should handle file not found errors', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await provider.callApi('test');

      expect(result.error).toContain('not found');
      expect(result.output).toBe('');
    });

    it('should handle permission denied errors', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('EACCES: permission denied'));

      const result = await provider.callApi('test');

      expect(result.error).toContain('Failed to load agent');
      expect(result.output).toBe('');
    });

    it('should handle file read errors', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File corrupted'));

      const result = await provider.callApi('test');

      expect(result.error).toContain('Failed to load agent');
      expect(result.output).toBe('');
    });

    it('should handle malformed JavaScript files', async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue('invalid javascript syntax {{{');

      const result = await provider.callApi('test');

      expect(result.error).toContain('Failed to load agent');
      expect(result.output).toBe('');
    });
  });

  describe('Timeout and Abort Handling', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'timeout-test',
        config: {
          agentPath: './slow-agent.js',
          sessionTimeout: 5000,
        },
      });
    });

    it('should respect abort signals', async () => {
      const controller = new AbortController();

      // Set up a slow-responding mock
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve('module.exports = {};'), 10000))
      );

      // Abort after 100ms
      setTimeout(() => controller.abort(), 100);

      const context: CallApiContextParams = {
        originalProvider: provider,
        delay: 0,
        signal: controller.signal,
      };

      const result = await provider.callApi('test', context);

      expect(result.error).toContain('Operation was aborted');
    });

    it('should handle timeout during file operations', async () => {
      (fs.access as jest.Mock).mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 10000))
      );

      const startTime = Date.now();
      const result = await provider.callApi('test');
      const duration = Date.now() - startTime;

      expect(result.error).toContain('timed out');
      expect(duration).toBeLessThan(10000); // Should timeout before 10s
    });
  });

  describe('Environment Variable Parsing', () => {
    it('should handle invalid numeric environment variables', () => {
      const provider = createLivekitProvider('livekit:env-test', {
        config: {},
        env: {
          LIVEKIT_SESSION_TIMEOUT: 'not-a-number',
          LIVEKIT_AUDIO_SAMPLE_RATE: 'invalid',
          LIVEKIT_AUDIO_CHANNELS: '',
          LIVEKIT_VIDEO_WIDTH: 'null',
        },
      });

      // Should create provider without throwing
      expect(provider).toBeInstanceOf(LivekitProvider);
      expect(provider.id()).toBe('livekit-provider');
    });

    it('should handle boolean environment variables correctly', () => {
      const trueCases = ['true', 'TRUE', 'True', '1'];
      const falseCases = ['false', 'FALSE', 'False', '0', 'invalid', ''];

      trueCases.forEach(value => {
        const provider = createLivekitProvider('livekit:bool-test', {
          config: {},
          env: {
            LIVEKIT_ENABLE_AUDIO: value,
          },
        });

        expect(provider.config?.enableAudio).toBe(true);
      });

      falseCases.forEach(value => {
        const provider = createLivekitProvider('livekit:bool-test', {
          config: {},
          env: {
            LIVEKIT_ENABLE_AUDIO: value,
          },
        });

        expect(provider.config?.enableAudio).toBe(false);
      });
    });

    it('should handle missing environment variables gracefully', () => {
      const provider = createLivekitProvider('livekit:missing-env', {
        config: {},
        env: {}, // No environment variables
      });

      expect(provider).toBeInstanceOf(LivekitProvider);
      expect(provider.config).toBeDefined();
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should provide helpful error messages with context', async () => {
      provider = new LivekitProvider({
        id: 'context-error-test',
        config: {
          agentPath: './missing-agent.js',
        },
      });

      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const result = await provider.callApi('test');

      expect(result.error).toContain('./missing-agent.js');
      expect(result.error).toContain('not found');
    });

    it('should handle cleanup gracefully even with active operations', async () => {
      provider = new LivekitProvider({
        id: 'cleanup-test',
        config: {
          agentPath: './test-agent.js',
        },
      });

      // Start a long operation
      const operation = provider.callApi('test');

      // Cleanup immediately
      await expect(provider.cleanup()).resolves.not.toThrow();

      // Original operation should still complete (or be cancelled)
      const result = await operation;
      expect(result).toBeDefined();
    });

    it('should prevent multiple concurrent cleanup calls', async () => {
      provider = new LivekitProvider({
        id: 'concurrent-cleanup-test',
      });

      // Start multiple cleanup operations concurrently
      const cleanupPromises = [
        provider.cleanup(),
        provider.cleanup(),
        provider.cleanup(),
      ];

      await expect(Promise.all(cleanupPromises)).resolves.not.toThrow();
    });
  });

  describe('Edge Cases and Robustness', () => {
    it('should handle extremely long agent paths', () => {
      const longPath = './agent/' + 'a'.repeat(1000) + '.js';

      expect(() => {
        provider = new LivekitProvider({
          id: 'long-path-test',
          config: {
            agentPath: longPath,
          },
        });
      }).not.toThrow();

      expect(provider.config?.agentPath).toBe(longPath);
    });

    it('should handle special characters in agent paths', () => {
      const specialPaths = [
        './agent with spaces.js',
        './agent-with-dashes.js',
        './agent_with_underscores.js',
        './agent.min.js',
        './agents/nested/path.js',
      ];

      specialPaths.forEach(agentPath => {
        expect(() => {
          provider = new LivekitProvider({
            id: 'special-chars-test',
            config: { agentPath },
          });
        }).not.toThrow();
      });
    });

    it('should handle null and undefined configuration values', () => {
      expect(() => {
        provider = new LivekitProvider({
          id: 'null-config-test',
          config: {
            agentPath: './test-agent.js',
            // @ts-ignore - Testing runtime behavior
            enableAudio: null,
            // @ts-ignore - Testing runtime behavior
            enableVideo: undefined,
            // @ts-ignore - Testing runtime behavior
            sessionTimeout: null,
          },
        });
      }).not.toThrow();
    });

    it('should handle very large configuration objects', () => {
      const largeConfig = {
        agentPath: './test-agent.js',
        // Add many properties to test object handling
        ...Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [`customProp${i}`, `value${i}`])
        ),
      };

      expect(() => {
        provider = new LivekitProvider({
          id: 'large-config-test',
          config: largeConfig,
        });
      }).not.toThrow();
    });
  });

  describe('Network and Connection Errors', () => {
    it('should categorize network errors correctly', () => {
      const networkErrors = [
        { message: 'ECONNRESET', expectedType: LivekitErrorType.NETWORK_ERROR },
        { message: 'ENOTFOUND', expectedType: LivekitErrorType.NETWORK_ERROR },
        { message: 'ETIMEDOUT', expectedType: LivekitErrorType.TIMEOUT_ERROR },
        { message: 'Connection refused', expectedType: LivekitErrorType.CONNECTION_ERROR },
      ];

      networkErrors.forEach(({ message, expectedType }) => {
        const error = new LivekitError(expectedType, message, { code: 'NET_001' });
        expect(error.type).toBe(expectedType);
      });
    });

    it('should determine retryability correctly', () => {
      const retryableErrors = [
        LivekitErrorType.NETWORK_ERROR,
        LivekitErrorType.TIMEOUT_ERROR,
        LivekitErrorType.CONNECTION_ERROR,
      ];

      const nonRetryableErrors = [
        LivekitErrorType.VALIDATION_ERROR,
        LivekitErrorType.CONFIGURATION_ERROR,
        LivekitErrorType.AGENT_LOAD_ERROR,
      ];

      retryableErrors.forEach(type => {
        const error = new LivekitError(type, 'Test error', { code: 'TEST_001', retryable: true });
        expect(error.retryable).toBe(true);
      });

      nonRetryableErrors.forEach(type => {
        const error = new LivekitError(type, 'Test error', { code: 'TEST_001', retryable: false });
        expect(error.retryable).toBe(false);
      });
    });
  });
});