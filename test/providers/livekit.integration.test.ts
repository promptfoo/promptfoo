import { LivekitProvider, createLivekitProvider } from '../../src/providers/livekit';
import type { LivekitProviderOptions } from '../../src/providers/livekit';
import type { CallApiContextParams } from '../../src/types';
import { promises as fs } from 'fs';
import path from 'path';

// Mock filesystem operations for integration tests
jest.mock('fs', () => ({
  promises: {
    access: jest.fn().mockResolvedValue(undefined),
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

describe('LiveKit Provider Multi-Modal Integration Tests', () => {
  let provider: LivekitProvider;

  const createMultiModalAgent = () => `
module.exports = {
  prewarm: async (proc) => {
    proc.userData.startTime = Date.now();
    proc.userData.capabilities = ['text', 'audio', 'video', 'tools'];
  },
  entry: async (ctx) => {
    ctx.sendMessage = async (input) => {
      const inputType = typeof input;
      const isMultiModal = inputType === 'object' && input !== null;

      let response = '';
      let metadata = {
        messageCount: 1,
        inputModalities: [],
        responseModalities: ['text'],
        isMultiModal: false,
        processing: {
          duration: 50,
          enabledFeatures: ['text'],
        },
        quality: {
          completeness: 95,
          confidence: 0.9,
        },
        responseId: 'resp_' + Date.now(),
        timestamp: new Date().toISOString(),
        sessionId: ctx.sessionId || 'session_' + Date.now(),
      };

      if (isMultiModal) {
        // Handle multi-modal input
        if (input.text) {
          metadata.inputModalities.push('text');
          response += \`Text: "\${input.text}". \`;
        }

        if (input.audio) {
          metadata.inputModalities.push('audio');
          metadata.responseModalities.push('audio');
          metadata.processing.enabledFeatures.push('audio');
          metadata.audio = {
            format: input.audio.format || 'opus',
            sampleRate: input.audio.sampleRate || 48000,
            channels: input.audio.channels || 1,
            duration: input.audio.duration || 2.5,
          };
          response += \`Audio processed (\${metadata.audio.format}, \${metadata.audio.sampleRate}Hz). \`;
        }

        if (input.video) {
          metadata.inputModalities.push('video');
          metadata.responseModalities.push('video');
          metadata.processing.enabledFeatures.push('video');
          metadata.video = {
            format: input.video.format || 'mp4',
            width: input.video.width || 1280,
            height: input.video.height || 720,
            framerate: input.video.framerate || 30,
            duration: input.video.duration || 3.0,
          };
          response += \`Video processed (\${metadata.video.format}, \${metadata.video.width}x\${metadata.video.height}). \`;
        }

        metadata.isMultiModal = metadata.inputModalities.length > 1;
      } else {
        // Handle simple text input
        metadata.inputModalities.push('text');
        response = \`Echo: \${input}\`;
      }

      // Simulate tool calls for certain inputs
      if ((typeof input === 'string' && input.includes('tool')) ||
          (input && input.text && input.text.includes('tool'))) {
        metadata.toolCalls = [{
          id: 'tool_' + Date.now(),
          name: 'example_tool',
          arguments: { query: 'example' },
          result: { status: 'success', data: 'tool result' },
          status: 'success'
        }];
        metadata.processing.enabledFeatures.push('tools');
        response += 'Tool executed successfully. ';
      }

      return {
        response: response.trim(),
        metadata,
      };
    };
  },
  config: {
    name: 'Multi-Modal Test Agent',
    capabilities: ['text', 'audio', 'video', 'tools'],
  },
};
`;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockResolvedValue(createMultiModalAgent());
  });

  afterEach(async () => {
    if (provider) {
      await provider.cleanup();
    }
  });

  describe('Audio Processing Integration', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'audio-test-provider',
        config: {
          agentPath: './multimodal-agent.js',
          enableAudio: true,
          enableVideo: false,
          enableChat: true,
          sessionTimeout: 30000,
        },
      });
    });

    it('should process audio data URLs correctly', async () => {
      const audioInput = 'audio:data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+L1wmseBDSH0fPTgjMGHm7A7+OZURE Analyze this audio';

      const result = await provider.callApi(audioInput);

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('Audio processed');
      expect(result.metadata?.inputModalities).toContain('audio');
      expect(result.metadata?.audio).toBeDefined();
      expect(result.metadata?.audio?.format).toBe('wav');
      expect(result.metadata?.audio?.sampleRate).toBeDefined();
    });

    it('should handle audio URLs', async () => {
      const audioInput = 'audio:https://example.com/sample.opus Please analyze this audio file';

      const result = await provider.callApi(audioInput);

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('Audio processed');
      expect(result.metadata?.inputModalities).toContain('audio');
      expect(result.metadata?.audio?.format).toBe('opus');
    });

    it('should process multiple audio formats', async () => {
      const formats = ['wav', 'mp3', 'opus', 'flac'];

      for (const format of formats) {
        const audioInput = `audio:data:audio/${format};base64,dGVzdGRhdGE= Process this ${format} audio`;

        const result = await provider.callApi(audioInput);

        expect(result.error).toBeUndefined();
        expect(result.output).toContain('Audio processed');
        expect(result.metadata?.audio?.format).toBe(format);
      }
    });
  });

  describe('Video Processing Integration', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'video-test-provider',
        config: {
          agentPath: './multimodal-agent.js',
          enableAudio: false,
          enableVideo: true,
          enableChat: true,
          sessionTimeout: 30000,
        },
      });
    });

    it('should process video URLs correctly', async () => {
      const videoInput = 'video:https://example.com/sample.mp4 Analyze this video content';

      const result = await provider.callApi(videoInput);

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('Video processed');
      expect(result.metadata?.inputModalities).toContain('video');
      expect(result.metadata?.video).toBeDefined();
      expect(result.metadata?.video?.format).toBe('mp4');
      expect(result.metadata?.video?.width).toBeDefined();
      expect(result.metadata?.video?.height).toBeDefined();
    });

    it('should handle video data URLs', async () => {
      const videoInput = 'video:data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OsggEXTbuMU6uEHFO7a1OsggG97AEAAAAAAABZAEAAAAAAAF9nFjf';

      const result = await provider.callApi(videoInput);

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('Video processed');
      expect(result.metadata?.video?.format).toBe('webm');
    });

    it('should process multiple video formats', async () => {
      const formats = ['mp4', 'webm', 'avi', 'mov'];

      for (const format of formats) {
        const videoInput = `video:https://example.com/sample.${format} Process this ${format} video`;

        const result = await provider.callApi(videoInput);

        expect(result.error).toBeUndefined();
        expect(result.output).toContain('Video processed');
        expect(result.metadata?.video?.format).toBe(format);
      }
    });
  });

  describe('Multi-Modal Combination Tests', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'multimodal-test-provider',
        config: {
          agentPath: './multimodal-agent.js',
          enableAudio: true,
          enableVideo: true,
          enableChat: true,
          sessionTimeout: 30000,
        },
      });
    });

    it('should handle audio + video combination', async () => {
      const multiModalInput = 'audio:data:audio/opus;base64,T2dnUwACAAAAAAAAAAAiAGgAAAAAALA8AhQBHgF2b3JiaXMAAAAAAUAfAAAAAAAAgLsAAAAAAAC4AU9nZ1MAAgA\\nvideo:https://example.com/sample.webm Analyze both audio and video content';

      const result = await provider.callApi(multiModalInput);

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('Audio processed');
      expect(result.output).toContain('Video processed');
      expect(result.metadata?.inputModalities).toContain('audio');
      expect(result.metadata?.inputModalities).toContain('video');
      expect(result.metadata?.isMultiModal).toBe(true);
      expect(result.metadata?.responseModalities).toContain('audio');
      expect(result.metadata?.responseModalities).toContain('video');
    });

    it('should handle audio + text combination', async () => {
      const input = 'audio:data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a Transcribe this audio and tell me what you think';

      const result = await provider.callApi(input);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.inputModalities).toContain('audio');
      expect(result.metadata?.inputModalities).toContain('text');
      expect(result.metadata?.isMultiModal).toBe(true);
    });

    it('should handle video + text combination', async () => {
      const input = 'video:https://example.com/demo.mp4 What objects do you see in this video?';

      const result = await provider.callApi(input);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.inputModalities).toContain('video');
      expect(result.metadata?.inputModalities).toContain('text');
      expect(result.metadata?.isMultiModal).toBe(true);
    });

    it('should handle triple combination (audio + video + text)', async () => {
      const input = 'audio:data:audio/opus;base64,T2dnUwACAAAAAAAAAAAiAGgAAAAAALA8AhQBHgF2b3JiaXMAAAAAAUAfAAAAAAAAgLsAAAAAAAC4AU9nZ1MAAgA\\nvideo:https://example.com/sample.mp4 Please analyze both the audio track and video content';

      const result = await provider.callApi(input);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.inputModalities).toHaveLength(3);
      expect(result.metadata?.inputModalities).toContain('audio');
      expect(result.metadata?.inputModalities).toContain('video');
      expect(result.metadata?.inputModalities).toContain('text');
      expect(result.metadata?.isMultiModal).toBe(true);
    });
  });

  describe('Tool Integration Tests', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'tools-test-provider',
        config: {
          agentPath: './multimodal-agent.js',
          enableAudio: true,
          enableVideo: true,
          enableChat: true,
          sessionTimeout: 30000,
        },
      });
    });

    it('should execute tools based on input content', async () => {
      const input = 'Please use a tool to help me with this task';

      const result = await provider.callApi(input);

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('Tool executed');
      expect(result.metadata?.toolCalls).toBeDefined();
      expect(result.metadata?.toolCalls).toHaveLength(1);
      expect(result.metadata?.toolCalls?.[0].name).toBe('example_tool');
      expect(result.metadata?.toolCalls?.[0].status).toBe('success');
    });

    it('should execute tools with multi-modal input', async () => {
      const input = 'audio:data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a Use a tool to analyze this audio';

      const result = await provider.callApi(input);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.inputModalities).toContain('audio');
      expect(result.metadata?.toolCalls).toBeDefined();
      expect(result.metadata?.processing?.enabledFeatures).toContain('tools');
      expect(result.metadata?.processing?.enabledFeatures).toContain('audio');
    });

    it('should include tool results in response metadata', async () => {
      const input = 'Execute a tool for me please';

      const result = await provider.callApi(input);

      expect(result.error).toBeUndefined();
      const toolCall = result.metadata?.toolCalls?.[0];
      expect(toolCall?.result).toBeDefined();
      expect(toolCall?.result).toEqual({
        status: 'success',
        data: 'tool result',
      });
    });
  });

  describe('Response Standardization Tests', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'standardization-test-provider',
        config: {
          agentPath: './multimodal-agent.js',
          enableAudio: true,
          enableVideo: true,
          enableChat: true,
          sessionTimeout: 30000,
        },
      });
    });

    it('should include required metadata fields', async () => {
      const result = await provider.callApi('Test message');

      expect(result.error).toBeUndefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.responseId).toBeDefined();
      expect(result.metadata?.timestamp).toBeDefined();
      expect(result.metadata?.sessionId).toBeDefined();
      expect(result.metadata?.quality).toBeDefined();
      expect(result.metadata?.processing).toBeDefined();
    });

    it('should provide quality indicators', async () => {
      const result = await provider.callApi('Quality test message');

      expect(result.metadata?.quality?.completeness).toBeGreaterThan(0);
      expect(result.metadata?.quality?.completeness).toBeLessThanOrEqual(100);
      expect(result.metadata?.quality?.confidence).toBeGreaterThan(0);
      expect(result.metadata?.quality?.confidence).toBeLessThanOrEqual(1);
    });

    it('should track processing information', async () => {
      const result = await provider.callApi('Processing test');

      expect(result.metadata?.processing?.duration).toBeGreaterThan(0);
      expect(result.metadata?.processing?.enabledFeatures).toContain('text');
      expect(Array.isArray(result.metadata?.processing?.enabledFeatures)).toBe(true);
    });

    it('should categorize response modalities correctly', async () => {
      const audioInput = 'audio:data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a Process audio';

      const result = await provider.callApi(audioInput);

      expect(result.metadata?.responseModalities).toContain('text');
      expect(result.metadata?.responseModalities).toContain('audio');
      expect(Array.isArray(result.metadata?.responseModalities)).toBe(true);
    });

    it('should generate unique response IDs', async () => {
      const results = await Promise.all([
        provider.callApi('Message 1'),
        provider.callApi('Message 2'),
        provider.callApi('Message 3'),
      ]);

      const responseIds = results.map(r => r.metadata?.responseId);
      const uniqueIds = new Set(responseIds);

      expect(uniqueIds.size).toBe(3); // All IDs should be unique
      responseIds.forEach(id => {
        expect(typeof id).toBe('string');
        expect(id?.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Configuration Integration Tests', () => {
    it('should respect audio configuration settings', async () => {
      provider = new LivekitProvider({
        id: 'audio-config-test',
        config: {
          agentPath: './multimodal-agent.js',
          enableAudio: true,
          enableVideo: false,
          audioConfig: {
            sampleRate: 44100,
            channels: 2,
            bitrate: 128000,
          },
        },
      });

      const input = 'audio:data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a Test audio';

      const result = await provider.callApi(input);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.inputModalities).toContain('audio');
      // Audio should be processed based on configuration
      expect(result.output).toContain('Audio processed');
    });

    it('should respect video configuration settings', async () => {
      provider = new LivekitProvider({
        id: 'video-config-test',
        config: {
          agentPath: './multimodal-agent.js',
          enableAudio: false,
          enableVideo: true,
          videoConfig: {
            width: 1920,
            height: 1080,
            framerate: 30,
            codec: 'h264',
          },
        },
      });

      const input = 'video:https://example.com/test.mp4 Analyze video';

      const result = await provider.callApi(input);

      expect(result.error).toBeUndefined();
      expect(result.metadata?.inputModalities).toContain('video');
      expect(result.output).toContain('Video processed');
    });

    it('should handle disabled modalities gracefully', async () => {
      provider = new LivekitProvider({
        id: 'disabled-modalities-test',
        config: {
          agentPath: './multimodal-agent.js',
          enableAudio: false,
          enableVideo: false,
          enableChat: true,
        },
      });

      const input = 'audio:data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a This should still work with text';

      const result = await provider.callApi(input);

      expect(result.error).toBeUndefined();
      // Should still process the text portion
      expect(result.metadata?.inputModalities).toContain('text');
    });
  });
});