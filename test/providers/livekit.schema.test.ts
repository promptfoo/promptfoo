import { createLivekitProvider, LivekitProvider } from '../../src/providers/livekit';
import type { LivekitProviderOptions } from '../../src/providers/livekit';

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

describe('LiveKit Provider Configuration Schema and Environment Variables', () => {
  describe('Provider Path Parsing', () => {
    it('should parse livekit:agent:path format correctly', () => {
      const testCases = [
        { path: 'livekit:agent:my-agent', expected: 'my-agent' },
        { path: 'livekit:agent:path/to/agent.js', expected: 'path/to/agent.js' },
        { path: 'livekit:agent:./relative/path.js', expected: './relative/path.js' },
        { path: 'livekit:agent:/absolute/path.js', expected: '/absolute/path.js' },
      ];

      testCases.forEach(({ path, expected }) => {
        const provider = createLivekitProvider(path, {
          config: {},
          env: {},
        });

        expect(provider.config?.agentPath).toBe(expected);
      });
    });

    it('should parse livekit:name format correctly', () => {
      const testCases = [
        { path: 'livekit:simple-agent', expected: 'simple-agent' },
        { path: 'livekit:complex-agent.js', expected: 'complex-agent.js' },
        { path: 'livekit:nested-agent', expected: 'nested-agent' },
      ];

      testCases.forEach(({ path, expected }) => {
        const provider = createLivekitProvider(path, {
          config: {},
          env: {},
        });

        expect(provider.config?.agentPath).toBe(expected);
      });
    });

    it('should handle edge cases in provider paths', () => {
      const edgeCases = [
        { path: 'livekit:', expected: '' },
        { path: 'livekit:agent:', expected: '' },
        { path: 'livekit:agent::', expected: ':' },
        { path: 'livekit:with-many-colons:in:the:path', expected: 'with-many-colons:in:the:path' },
      ];

      edgeCases.forEach(({ path, expected }) => {
        const provider = createLivekitProvider(path, {
          config: {},
          env: {},
        });

        expect(provider.config?.agentPath).toBe(expected);
      });
    });
  });

  describe('Environment Variable Mapping', () => {
    it('should map all LiveKit environment variables correctly', () => {
      const envVars = {
        // Connection settings
        LIVEKIT_URL: 'wss://test.livekit.io',
        LIVEKIT_API_KEY: 'test-api-key',
        LIVEKIT_API_SECRET: 'test-api-secret',
        LIVEKIT_REGION: 'us-west-2',

        // Feature toggles
        LIVEKIT_ENABLE_AUDIO: 'true',
        LIVEKIT_ENABLE_VIDEO: 'false',
        LIVEKIT_ENABLE_CHAT: 'true',

        // Session configuration
        LIVEKIT_SESSION_TIMEOUT: '45000',
        LIVEKIT_ROOM_NAME: 'test-room',
        LIVEKIT_PARTICIPANT_NAME: 'test-participant',

        // Audio configuration
        LIVEKIT_AUDIO_SAMPLE_RATE: '48000',
        LIVEKIT_AUDIO_CHANNELS: '2',
        LIVEKIT_AUDIO_BITRATE: '128000',

        // Video configuration
        LIVEKIT_VIDEO_WIDTH: '1920',
        LIVEKIT_VIDEO_HEIGHT: '1080',
        LIVEKIT_VIDEO_FRAMERATE: '30',
        LIVEKIT_VIDEO_BITRATE: '2000000',

        // Debug settings
        LIVEKIT_LOG_LEVEL: 'debug',
      };

      const provider = createLivekitProvider('livekit:env-test', {
        config: {},
        env: envVars,
      });

      // Connection settings
      expect(provider.config?.serverUrl).toBe('wss://test.livekit.io');
      expect(provider.config?.apiKey).toBe('test-api-key');
      expect(provider.config?.apiSecret).toBe('test-api-secret');
      expect(provider.config?.region).toBe('us-west-2');

      // Feature toggles
      expect(provider.config?.enableAudio).toBe(true);
      expect(provider.config?.enableVideo).toBe(false);
      expect(provider.config?.enableChat).toBe(true);

      // Session configuration
      expect(provider.config?.sessionTimeout).toBe(45000);
      expect(provider.config?.roomName).toBe('test-room');
      expect(provider.config?.participantName).toBe('test-participant');

      // Audio configuration
      expect(provider.config?.audioConfig?.sampleRate).toBe(48000);
      expect(provider.config?.audioConfig?.channels).toBe(2);
      expect(provider.config?.audioConfig?.bitrate).toBe(128000);

      // Video configuration
      expect(provider.config?.videoConfig?.width).toBe(1920);
      expect(provider.config?.videoConfig?.height).toBe(1080);
      expect(provider.config?.videoConfig?.framerate).toBe(30);
      expect(provider.config?.videoConfig?.bitrate).toBe(2000000);

      // Debug settings
      expect(provider.config?.logLevel).toBe('debug');
    });

    it('should handle missing environment variables gracefully', () => {
      const provider = createLivekitProvider('livekit:minimal', {
        config: {},
        env: {},
      });

      expect(provider).toBeInstanceOf(LivekitProvider);
      expect(provider.config).toBeDefined();
      expect(provider.config?.agentPath).toBe('minimal');
    });

    it('should prioritize explicit config over environment variables', () => {
      const provider = createLivekitProvider('livekit:priority-test', {
        config: {
          config: {
            serverUrl: 'wss://explicit.livekit.io',
            enableAudio: false,
            sessionTimeout: 20000,
          },
        },
        env: {
          LIVEKIT_URL: 'wss://env.livekit.io',
          LIVEKIT_ENABLE_AUDIO: 'true',
          LIVEKIT_SESSION_TIMEOUT: '60000',
        },
      });

      // Explicit config should take precedence
      expect(provider.config?.serverUrl).toBe('wss://explicit.livekit.io');
      expect(provider.config?.enableAudio).toBe(false);
      expect(provider.config?.sessionTimeout).toBe(20000);
    });
  });

  describe('Configuration Defaults', () => {
    it('should apply correct default values', () => {
      const provider = new LivekitProvider({
        id: 'defaults-test',
        config: {
          agentPath: './test-agent.js',
        },
      });

      expect(provider.config?.sessionTimeout).toBe(30000);
      expect(provider.config?.maxConcurrentSessions).toBe(1);
      expect(provider.config?.retryAttempts).toBe(3);
      expect(provider.config?.retryDelay).toBe(1000);
      expect(provider.config?.enableAudio).toBe(false);
      expect(provider.config?.enableVideo).toBe(false);
      expect(provider.config?.enableChat).toBe(true);
      expect(provider.config?.debug).toBe(false);
      expect(provider.config?.enableMetrics).toBe(false);
      expect(provider.config?.enableTracing).toBe(false);
      expect(provider.config?.enableScreenShare).toBe(false);
    });

    it('should apply correct audio defaults', () => {
      const provider = new LivekitProvider({
        id: 'audio-defaults-test',
        config: {
          agentPath: './test-agent.js',
          enableAudio: true,
        },
      });

      expect(provider.config?.audioConfig?.sampleRate).toBe(48000);
      expect(provider.config?.audioConfig?.channels).toBe(1);
      expect(provider.config?.audioConfig?.bitrate).toBe(64000);
      expect(provider.config?.audioConfig?.codec).toBe('opus');
      expect(provider.config?.audioConfig?.enableEchoCancellation).toBe(true);
      expect(provider.config?.audioConfig?.enableNoiseSuppression).toBe(true);
      expect(provider.config?.audioConfig?.enableAutoGainControl).toBe(true);
    });

    it('should apply correct video defaults', () => {
      const provider = new LivekitProvider({
        id: 'video-defaults-test',
        config: {
          agentPath: './test-agent.js',
          enableVideo: true,
        },
      });

      expect(provider.config?.videoConfig?.width).toBe(1280);
      expect(provider.config?.videoConfig?.height).toBe(720);
      expect(provider.config?.videoConfig?.framerate).toBe(30);
      expect(provider.config?.videoConfig?.bitrate).toBe(1000000);
      expect(provider.config?.videoConfig?.codec).toBe('vp8');
      expect(provider.config?.videoConfig?.enableHardwareAcceleration).toBe(true);
    });

    it('should apply correct room defaults', () => {
      const provider = new LivekitProvider({
        id: 'room-defaults-test',
        config: {
          agentPath: './test-agent.js',
        },
      });

      expect(provider.config?.roomConfig?.maxParticipants).toBe(50);
      expect(provider.config?.roomConfig?.emptyTimeout).toBe(300);
      expect(provider.config?.roomConfig?.enableRecording).toBe(false);
      expect(provider.config?.roomConfig?.recordingConfig?.audio).toBe(true);
      expect(provider.config?.roomConfig?.recordingConfig?.video).toBe(true);
      expect(provider.config?.roomConfig?.recordingConfig?.output).toBe('mp4');
      expect(provider.config?.roomConfig?.recordingConfig?.preset).toBe('medium');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate session timeout bounds', () => {
      const invalidTimeouts = [-1, 0, 999, 300001, 500000];

      invalidTimeouts.forEach(timeout => {
        expect(() => {
          new LivekitProvider({
            id: 'timeout-validation',
            config: {
              agentPath: './test-agent.js',
              sessionTimeout: timeout,
            },
          });
        }).toThrow(/sessionTimeout must be between/);
      });

      const validTimeouts = [1000, 5000, 30000, 60000, 300000];

      validTimeouts.forEach(timeout => {
        expect(() => {
          new LivekitProvider({
            id: 'timeout-validation',
            config: {
              agentPath: './test-agent.js',
              sessionTimeout: timeout,
            },
          });
        }).not.toThrow();
      });
    });

    it('should validate audio configuration', () => {
      // Invalid sample rates
      expect(() => {
        new LivekitProvider({
          id: 'audio-validation',
          config: {
            agentPath: './test-agent.js',
            audioConfig: { sampleRate: 22050 },
          },
        });
      }).toThrow(/audioConfig.sampleRate must be one of/);

      // Invalid channel count
      expect(() => {
        new LivekitProvider({
          id: 'audio-validation',
          config: {
            agentPath: './test-agent.js',
            audioConfig: { channels: 3 },
          },
        });
      }).toThrow(/audioConfig.channels must be/);

      // Valid configurations
      const validConfigs = [
        { sampleRate: 8000, channels: 1 },
        { sampleRate: 16000, channels: 2 },
        { sampleRate: 24000, channels: 1 },
        { sampleRate: 48000, channels: 2 },
      ];

      validConfigs.forEach(audioConfig => {
        expect(() => {
          new LivekitProvider({
            id: 'audio-validation',
            config: {
              agentPath: './test-agent.js',
              audioConfig,
            },
          });
        }).not.toThrow();
      });
    });

    it('should validate video configuration', () => {
      // Invalid dimensions
      expect(() => {
        new LivekitProvider({
          id: 'video-validation',
          config: {
            agentPath: './test-agent.js',
            videoConfig: { width: 10000 },
          },
        });
      }).toThrow(/videoConfig.width must be between/);

      expect(() => {
        new LivekitProvider({
          id: 'video-validation',
          config: {
            agentPath: './test-agent.js',
            videoConfig: { height: 10000 },
          },
        });
      }).toThrow(/videoConfig.height must be between/);

      // Invalid framerate
      expect(() => {
        new LivekitProvider({
          id: 'video-validation',
          config: {
            agentPath: './test-agent.js',
            videoConfig: { framerate: 120 },
          },
        });
      }).toThrow(/videoConfig.framerate must be between/);

      // Valid configurations
      const validConfigs = [
        { width: 640, height: 480, framerate: 15 },
        { width: 1280, height: 720, framerate: 30 },
        { width: 1920, height: 1080, framerate: 60 },
      ];

      validConfigs.forEach(videoConfig => {
        expect(() => {
          new LivekitProvider({
            id: 'video-validation',
            config: {
              agentPath: './test-agent.js',
              videoConfig,
            },
          });
        }).not.toThrow();
      });
    });

    it('should validate retry configuration', () => {
      // Invalid retry attempts
      expect(() => {
        new LivekitProvider({
          id: 'retry-validation',
          config: {
            agentPath: './test-agent.js',
            retryAttempts: -1,
          },
        });
      }).toThrow(/retryAttempts must be between/);

      expect(() => {
        new LivekitProvider({
          id: 'retry-validation',
          config: {
            agentPath: './test-agent.js',
            retryAttempts: 11,
          },
        });
      }).toThrow(/retryAttempts must be between/);

      // Invalid retry delay
      expect(() => {
        new LivekitProvider({
          id: 'retry-validation',
          config: {
            agentPath: './test-agent.js',
            retryDelay: -100,
          },
        });
      }).toThrow(/retryDelay must be between/);

      // Valid configurations
      const validConfigs = [
        { retryAttempts: 0, retryDelay: 0 },
        { retryAttempts: 3, retryDelay: 1000 },
        { retryAttempts: 10, retryDelay: 10000 },
      ];

      validConfigs.forEach(config => {
        expect(() => {
          new LivekitProvider({
            id: 'retry-validation',
            config: {
              agentPath: './test-agent.js',
              ...config,
            },
          });
        }).not.toThrow();
      });
    });
  });

  describe('Numeric Environment Variable Parsing', () => {
    it('should parse valid numeric strings correctly', () => {
      const provider = createLivekitProvider('livekit:numeric-test', {
        config: {},
        env: {
          LIVEKIT_SESSION_TIMEOUT: '45000',
          LIVEKIT_AUDIO_SAMPLE_RATE: '48000',
          LIVEKIT_AUDIO_CHANNELS: '2',
          LIVEKIT_VIDEO_WIDTH: '1920',
          LIVEKIT_VIDEO_HEIGHT: '1080',
          LIVEKIT_VIDEO_FRAMERATE: '30',
        },
      });

      expect(provider.config?.sessionTimeout).toBe(45000);
      expect(provider.config?.audioConfig?.sampleRate).toBe(48000);
      expect(provider.config?.audioConfig?.channels).toBe(2);
      expect(provider.config?.videoConfig?.width).toBe(1920);
      expect(provider.config?.videoConfig?.height).toBe(1080);
      expect(provider.config?.videoConfig?.framerate).toBe(30);
    });

    it('should handle invalid numeric strings gracefully', () => {
      const provider = createLivekitProvider('livekit:invalid-numeric', {
        config: {},
        env: {
          LIVEKIT_SESSION_TIMEOUT: 'not-a-number',
          LIVEKIT_AUDIO_SAMPLE_RATE: '',
          LIVEKIT_AUDIO_CHANNELS: 'two',
          LIVEKIT_VIDEO_WIDTH: 'null',
          LIVEKIT_VIDEO_HEIGHT: 'undefined',
          LIVEKIT_VIDEO_FRAMERATE: '30.5.5',
        },
      });

      // Should create provider without throwing
      expect(provider).toBeInstanceOf(LivekitProvider);
      expect(provider.id()).toBe('livekit-provider');
    });

    it('should handle edge cases in numeric parsing', () => {
      const provider = createLivekitProvider('livekit:edge-numeric', {
        config: {},
        env: {
          LIVEKIT_SESSION_TIMEOUT: '0',
          LIVEKIT_AUDIO_CHANNELS: '0',
          LIVEKIT_VIDEO_WIDTH: '-100',
          LIVEKIT_VIDEO_FRAMERATE: '999999',
        },
      });

      // Should create provider without throwing
      expect(provider).toBeInstanceOf(LivekitProvider);
    });
  });

  describe('Boolean Environment Variable Parsing', () => {
    it('should parse boolean environment variables correctly', () => {
      const truthyValues = ['true', 'TRUE', 'True', '1', 'yes', 'YES', 'on', 'ON'];
      const falsyValues = ['false', 'FALSE', 'False', '0', 'no', 'NO', 'off', 'OFF', '', 'invalid'];

      truthyValues.forEach(value => {
        const provider = createLivekitProvider('livekit:bool-test', {
          config: {},
          env: { LIVEKIT_ENABLE_AUDIO: value },
        });

        expect(provider.config?.enableAudio).toBe(true);
      });

      falsyValues.forEach(value => {
        const provider = createLivekitProvider('livekit:bool-test', {
          config: {},
          env: { LIVEKIT_ENABLE_AUDIO: value },
        });

        expect(provider.config?.enableAudio).toBe(false);
      });
    });

    it('should handle multiple boolean environment variables', () => {
      const provider = createLivekitProvider('livekit:multi-bool', {
        config: {},
        env: {
          LIVEKIT_ENABLE_AUDIO: 'true',
          LIVEKIT_ENABLE_VIDEO: 'false',
          LIVEKIT_ENABLE_CHAT: '1',
          LIVEKIT_DEBUG: '0',
        },
      });

      expect(provider.config?.enableAudio).toBe(true);
      expect(provider.config?.enableVideo).toBe(false);
      expect(provider.config?.enableChat).toBe(true);
      expect(provider.config?.debug).toBe(false);
    });
  });

  describe('Configuration Merging', () => {
    it('should merge configurations in correct priority order', () => {
      const provider = createLivekitProvider('livekit:merge-test', {
        config: {
          id: 'custom-id',
          config: {
            sessionTimeout: 25000,
            enableAudio: true,
            audioConfig: {
              sampleRate: 24000,
            },
          },
        },
        env: {
          LIVEKIT_SESSION_TIMEOUT: '45000',
          LIVEKIT_ENABLE_AUDIO: 'false',
          LIVEKIT_ENABLE_VIDEO: 'true',
          LIVEKIT_AUDIO_SAMPLE_RATE: '48000',
          LIVEKIT_AUDIO_CHANNELS: '2',
        },
      });

      // Explicit config should override environment
      expect(provider.config?.sessionTimeout).toBe(25000);
      expect(provider.config?.enableAudio).toBe(true);
      expect(provider.config?.audioConfig?.sampleRate).toBe(24000);

      // Environment should fill in missing values
      expect(provider.config?.enableVideo).toBe(true);
      expect(provider.config?.audioConfig?.channels).toBe(2);

      // Custom provider ID should be used
      expect(provider.id()).toBe('custom-id');
    });

    it('should handle deep configuration merging', () => {
      const provider = createLivekitProvider('livekit:deep-merge', {
        config: {
          config: {
            audioConfig: {
              sampleRate: 16000,
              codec: 'pcm',
            },
            videoConfig: {
              width: 640,
            },
          },
        },
        env: {
          LIVEKIT_AUDIO_CHANNELS: '1',
          LIVEKIT_AUDIO_BITRATE: '32000',
          LIVEKIT_VIDEO_HEIGHT: '480',
          LIVEKIT_VIDEO_FRAMERATE: '15',
        },
      });

      // Audio config should be merged
      expect(provider.config?.audioConfig?.sampleRate).toBe(16000); // From explicit config
      expect(provider.config?.audioConfig?.codec).toBe('pcm'); // From explicit config
      expect(provider.config?.audioConfig?.channels).toBe(1); // From environment
      expect(provider.config?.audioConfig?.bitrate).toBe(32000); // From environment

      // Video config should be merged
      expect(provider.config?.videoConfig?.width).toBe(640); // From explicit config
      expect(provider.config?.videoConfig?.height).toBe(480); // From environment
      expect(provider.config?.videoConfig?.framerate).toBe(15); // From environment
    });
  });
});