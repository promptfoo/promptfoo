import { LivekitProvider, createLivekitProvider } from '../../src/providers/livekit';
import type { LivekitProviderOptions } from '../../src/providers/livekit';
import { promises as fs } from 'fs';

// Mock filesystem operations
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

describe('LiveKit Provider Performance Tests', () => {
  let provider: LivekitProvider;

  const createPerformanceAgent = () => `
module.exports = {
  prewarm: async (proc) => {
    proc.userData.startTime = Date.now();
    proc.userData.processedItems = 0;
  },
  entry: async (ctx) => {
    ctx.sendMessage = async (input) => {
      const startTime = Date.now();

      // Simulate processing time based on input complexity
      let processingTime = 50; // Base processing time in ms
      let modalities = ['text'];
      let inputSize = 0;

      if (typeof input === 'object' && input !== null) {
        if (input.audio) {
          processingTime += 200; // Audio processing overhead
          modalities.push('audio');
          inputSize += input.audio.size || 1024; // Simulate audio data size
        }
        if (input.video) {
          processingTime += 500; // Video processing overhead
          modalities.push('video');
          inputSize += input.video.size || 10240; // Simulate video data size
        }
        if (input.text) {
          inputSize += input.text.length;
        }
      } else {
        inputSize = String(input).length;
      }

      // Simulate actual processing delay
      await new Promise(resolve => setTimeout(resolve, processingTime));

      const endTime = Date.now();
      const duration = endTime - startTime;

      ctx.userData.processedItems++;

      return {
        response: \`Processed \${modalities.join(', ')} input in \${duration}ms\`,
        metadata: {
          performance: {
            processingTime: duration,
            inputSize,
            modalities,
            itemsProcessed: ctx.userData.processedItems,
            throughput: inputSize / (duration / 1000), // bytes per second
          },
          quality: {
            completeness: 100,
            confidence: 0.95,
          },
          responseId: 'perf_' + Date.now(),
          timestamp: new Date().toISOString(),
          sessionId: ctx.sessionId || 'session_' + Date.now(),
        },
      };
    };
  },
  config: {
    name: 'Performance Test Agent',
    capabilities: ['text', 'audio', 'video'],
  },
};
`;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockResolvedValue(createPerformanceAgent());
  });

  afterEach(async () => {
    if (provider) {
      await provider.cleanup();
    }
  });

  describe('Basic Performance Metrics', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'performance-test',
        config: {
          agentPath: './performance-agent.js',
          sessionTimeout: 60000,
        },
      });
    });

    it('should process simple text inputs quickly', async () => {
      const input = 'Simple text message for performance testing';
      const startTime = Date.now();

      const result = await provider.callApi(input);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(result.error).toBeUndefined();
      expect(totalTime).toBeLessThan(1000); // Should complete within 1 second
      expect(result.metadata?.performance?.processingTime).toBeDefined();
      expect(result.metadata?.performance?.inputSize).toBe(input.length);
    });

    it('should handle concurrent requests efficiently', async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        provider.callApi(`Test message ${i}`)
      );

      const startTime = Date.now();
      const results = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.error).toBeUndefined();
      });

      // Concurrent processing should be more efficient than sequential
      expect(totalTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should maintain throughput under load', async () => {
      const messageCount = 10;
      const message = 'Performance test message ' + 'x'.repeat(100);

      const startTime = Date.now();

      const results = await Promise.all(
        Array.from({ length: messageCount }, () => provider.callApi(message))
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const messagesPerSecond = messageCount / (totalTime / 1000);

      expect(results).toHaveLength(messageCount);
      results.forEach(result => {
        expect(result.error).toBeUndefined();
      });

      expect(messagesPerSecond).toBeGreaterThan(1); // At least 1 message per second
    });
  });

  describe('Audio Processing Performance', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'audio-performance-test',
        config: {
          agentPath: './performance-agent.js',
          enableAudio: true,
          audioConfig: {
            sampleRate: 48000,
            channels: 2,
            bitrate: 128000,
          },
          sessionTimeout: 60000,
        },
      });
    });

    it('should process small audio files efficiently', async () => {
      const smallAudioInput = 'audio:data:audio/wav;base64,' + 'A'.repeat(1000); // ~1KB audio data

      const startTime = Date.now();
      const result = await provider.callApi(smallAudioInput);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(result.error).toBeUndefined();
      expect(totalTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(result.metadata?.performance?.modalities).toContain('audio');
      expect(result.metadata?.performance?.throughput).toBeGreaterThan(0);
    });

    it('should handle multiple audio formats', async () => {
      const formats = ['wav', 'mp3', 'opus', 'flac'];
      const audioData = 'A'.repeat(2000); // ~2KB audio data

      const results = await Promise.all(
        formats.map(format =>
          provider.callApi(`audio:data:audio/${format};base64,${audioData}`)
        )
      );

      expect(results).toHaveLength(4);
      results.forEach((result, index) => {
        expect(result.error).toBeUndefined();
        expect(result.metadata?.performance?.modalities).toContain('audio');
      });
    });

    it('should scale processing time with audio size', async () => {
      const sizes = [500, 1000, 2000, 4000]; // Different audio data sizes
      const results = [];

      for (const size of sizes) {
        const audioData = 'A'.repeat(size);
        const input = `audio:data:audio/wav;base64,${audioData}`;

        const result = await provider.callApi(input);
        results.push({
          size,
          processingTime: result.metadata?.performance?.processingTime || 0,
          throughput: result.metadata?.performance?.throughput || 0,
        });
      }

      // Larger files should generally take more time to process
      expect(results[3].processingTime).toBeGreaterThan(results[0].processingTime);

      // Throughput should be relatively consistent
      const throughputs = results.map(r => r.throughput);
      const avgThroughput = throughputs.reduce((a, b) => a + b) / throughputs.length;

      throughputs.forEach(throughput => {
        expect(throughput).toBeGreaterThan(avgThroughput * 0.5); // Within 50% of average
        expect(throughput).toBeLessThan(avgThroughput * 2); // Within 200% of average
      });
    });
  });

  describe('Video Processing Performance', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'video-performance-test',
        config: {
          agentPath: './performance-agent.js',
          enableVideo: true,
          videoConfig: {
            width: 1280,
            height: 720,
            framerate: 30,
            bitrate: 2000000,
          },
          sessionTimeout: 60000,
        },
      });
    });

    it('should process video URLs efficiently', async () => {
      const videoInput = 'video:https://example.com/test-video.mp4';

      const startTime = Date.now();
      const result = await provider.callApi(videoInput);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(result.error).toBeUndefined();
      expect(totalTime).toBeLessThan(3000); // Should complete within 3 seconds
      expect(result.metadata?.performance?.modalities).toContain('video');
    });

    it('should handle different video resolutions', async () => {
      const resolutions = [
        { width: 640, height: 480, name: '480p' },
        { width: 1280, height: 720, name: '720p' },
        { width: 1920, height: 1080, name: '1080p' },
      ];

      const results = await Promise.all(
        resolutions.map(res =>
          provider.callApi(`video:https://example.com/test-${res.name}.mp4`)
        )
      );

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.error).toBeUndefined();
        expect(result.metadata?.performance?.modalities).toContain('video');
      });
    });

    it('should process multiple video formats', async () => {
      const formats = ['mp4', 'webm', 'avi', 'mov'];

      const results = await Promise.all(
        formats.map(format =>
          provider.callApi(`video:https://example.com/test.${format}`)
        )
      );

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result.error).toBeUndefined();
        expect(result.metadata?.performance?.modalities).toContain('video');
      });
    });
  });

  describe('Multi-Modal Processing Performance', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'multimodal-performance-test',
        config: {
          agentPath: './performance-agent.js',
          enableAudio: true,
          enableVideo: true,
          enableChat: true,
          sessionTimeout: 60000,
        },
      });
    });

    it('should handle audio + video combination efficiently', async () => {
      const multiModalInput = 'audio:data:audio/wav;base64,' + 'A'.repeat(1000) +
                              '\\nvideo:https://example.com/test.mp4 Process both media types';

      const startTime = Date.now();
      const result = await provider.callApi(multiModalInput);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(result.error).toBeUndefined();
      expect(totalTime).toBeLessThan(4000); // Should complete within 4 seconds
      expect(result.metadata?.performance?.modalities).toContain('audio');
      expect(result.metadata?.performance?.modalities).toContain('video');
      expect(result.metadata?.performance?.modalities).toContain('text');
    });

    it('should scale processing time with modality complexity', async () => {
      const inputs = [
        'Simple text only',
        'audio:data:audio/wav;base64,' + 'A'.repeat(500),
        'video:https://example.com/test.mp4',
        'audio:data:audio/wav;base64,' + 'A'.repeat(500) + '\\nvideo:https://example.com/test.mp4 Combined media'
      ];

      const results = [];

      for (const input of inputs) {
        const startTime = Date.now();
        const result = await provider.callApi(input);
        const endTime = Date.now();

        results.push({
          modalityCount: result.metadata?.performance?.modalities?.length || 0,
          processingTime: endTime - startTime,
          agentProcessingTime: result.metadata?.performance?.processingTime || 0,
        });
      }

      // More modalities should generally take longer to process
      expect(results[3].processingTime).toBeGreaterThan(results[0].processingTime);
      expect(results[3].modalityCount).toBeGreaterThan(results[0].modalityCount);
    });

    it('should maintain performance under mixed workload', async () => {
      const mixedInputs = [
        'Text message 1',
        'audio:data:audio/wav;base64,' + 'A'.repeat(800),
        'Text message 2',
        'video:https://example.com/test.mp4',
        'Text message 3',
        'audio:data:audio/wav;base64,' + 'A'.repeat(600) + '\\nvideo:https://example.com/mixed.mp4 Mixed content',
      ];

      const startTime = Date.now();
      const results = await Promise.all(
        mixedInputs.map(input => provider.callApi(input))
      );
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(results).toHaveLength(6);
      results.forEach(result => {
        expect(result.error).toBeUndefined();
      });

      expect(totalTime).toBeLessThan(8000); // Should complete within 8 seconds

      // Check that different modalities were processed
      const textCount = results.filter(r => r.metadata?.performance?.modalities?.includes('text')).length;
      const audioCount = results.filter(r => r.metadata?.performance?.modalities?.includes('audio')).length;
      const videoCount = results.filter(r => r.metadata?.performance?.modalities?.includes('video')).length;

      expect(textCount).toBeGreaterThan(0);
      expect(audioCount).toBeGreaterThan(0);
      expect(videoCount).toBeGreaterThan(0);
    });
  });

  describe('Memory and Resource Management', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'resource-test',
        config: {
          agentPath: './performance-agent.js',
          maxConcurrentSessions: 3,
          sessionTimeout: 30000,
        },
      });
    });

    it('should handle rapid sequential requests without leaking', async () => {
      const requestCount = 20;
      const requests = [];

      for (let i = 0; i < requestCount; i++) {
        requests.push(provider.callApi(`Sequential request ${i}`));
      }

      const results = await Promise.all(requests);

      expect(results).toHaveLength(requestCount);
      results.forEach((result, index) => {
        expect(result.error).toBeUndefined();
        expect(result.metadata?.performance?.itemsProcessed).toBeGreaterThan(0);
      });
    });

    it('should clean up resources properly', async () => {
      // Process some requests
      await provider.callApi('Test message 1');
      await provider.callApi('Test message 2');
      await provider.callApi('Test message 3');

      // Cleanup should not throw
      await expect(provider.cleanup()).resolves.not.toThrow();

      // Further requests after cleanup should handle gracefully
      const result = await provider.callApi('Test after cleanup');
      // Should either work (new session) or fail gracefully
      expect(result).toBeDefined();
    });

    it('should handle session timeout gracefully', async () => {
      const shortTimeoutProvider = new LivekitProvider({
        id: 'timeout-resource-test',
        config: {
          agentPath: './performance-agent.js',
          sessionTimeout: 1000, // Very short timeout
        },
      });

      try {
        // This should complete quickly
        const result1 = await shortTimeoutProvider.callApi('Quick message');
        expect(result1.error).toBeUndefined();

        // Wait for timeout
        await new Promise(resolve => setTimeout(resolve, 1500));

        // This should create a new session
        const result2 = await shortTimeoutProvider.callApi('After timeout');
        // Should either work with new session or handle timeout gracefully
        expect(result2).toBeDefined();

      } finally {
        await shortTimeoutProvider.cleanup();
      }
    });
  });

  describe('Performance Regression Tests', () => {
    beforeEach(() => {
      provider = new LivekitProvider({
        id: 'regression-test',
        config: {
          agentPath: './performance-agent.js',
          enableAudio: true,
          enableVideo: true,
          sessionTimeout: 60000,
        },
      });
    });

    it('should maintain consistent performance across multiple sessions', async () => {
      const sessionCount = 5;
      const messagesPerSession = 3;
      const sessionResults = [];

      for (let session = 0; session < sessionCount; session++) {
        const sessionStartTime = Date.now();
        const sessionMessages = [];

        for (let msg = 0; msg < messagesPerSession; msg++) {
          const result = await provider.callApi(`Session ${session} Message ${msg}`);
          sessionMessages.push(result);
        }

        const sessionEndTime = Date.now();
        sessionResults.push({
          session,
          duration: sessionEndTime - sessionStartTime,
          messages: sessionMessages,
        });

        // Small delay between sessions
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Check that all sessions completed successfully
      sessionResults.forEach(session => {
        session.messages.forEach(result => {
          expect(result.error).toBeUndefined();
        });
      });

      // Performance should be relatively consistent across sessions
      const durations = sessionResults.map(s => s.duration);
      const avgDuration = durations.reduce((a, b) => a + b) / durations.length;

      durations.forEach(duration => {
        expect(duration).toBeLessThan(avgDuration * 2); // No session should take twice the average
      });
    });

    it('should handle edge case inputs without performance degradation', async () => {
      const edgeCases = [
        '', // Empty string
        'A'.repeat(10000), // Very long text
        'audio:data:audio/wav;base64,', // Empty audio
        'video:', // Incomplete video URL
        'Special chars: 🎵🎬📹🔊💾🖥️⚡', // Unicode characters
        'Multi\nline\ninput\nwith\nbreaks', // Multi-line text
      ];

      const results = await Promise.all(
        edgeCases.map(input => provider.callApi(input))
      );

      expect(results).toHaveLength(edgeCases.length);

      // All should complete (either successfully or with graceful error handling)
      results.forEach(result => {
        expect(result).toBeDefined();
        // Either no error, or a graceful error message
        if (result.error) {
          expect(typeof result.error).toBe('string');
          expect(result.error.length).toBeGreaterThan(0);
        }
      });
    });
  });
});