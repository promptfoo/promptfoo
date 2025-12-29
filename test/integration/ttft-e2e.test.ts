import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { HttpProvider } from '../../src/providers/http';

describe('TTFT End-to-End Integration', () => {
  let server: Server;
  let serverUrl: string;

  beforeAll(async () => {
    // Create a mock streaming server that simulates OpenAI's API
    const app = express();
    app.use(express.json());

    app.post('/v1/chat/completions', (req, res) => {
      const isStreaming = req.body.stream === true;

      if (!isStreaming) {
        // Non-streaming response
        res.json({
          choices: [
            {
              message: {
                content: 'This is a non-streaming response',
              },
            },
          ],
        });
        return;
      }

      // Streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Simulate realistic streaming with delays
      const chunks = [
        { role: 'assistant' }, // Metadata chunk (no content)
        { content: 'Code' },
        { content: ' is' },
        { content: ' poetry' },
        { content: ' in' },
        { content: ' motion' },
      ];

      let chunkIndex = 0;

      const sendChunk = () => {
        if (chunkIndex >= chunks.length) {
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }

        const delta = chunks[chunkIndex];
        const data = {
          id: 'test-123',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              delta,
              finish_reason: null,
            },
          ],
        };

        res.write(`data: ${JSON.stringify(data)}\n\n`);
        chunkIndex++;

        // Simulate 50ms between chunks
        if (chunkIndex < chunks.length) {
          setTimeout(sendChunk, 50);
        } else {
          setTimeout(sendChunk, 50);
        }
      };

      // Start sending chunks after 100ms (simulate server processing)
      setTimeout(sendChunk, 100);
    });

    // Start server on random port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          serverUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should measure TTFT correctly for streaming responses', async () => {
    const provider = new HttpProvider(`${serverUrl}/v1/chat/completions`, {
      config: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          model: 'gpt-4',
          messages: [{ role: 'user', content: '{{prompt}}' }],
          stream: true,
        },
        transformResponse: `(json, text) => {
          if (json?.choices?.[0]?.message?.content) {
            return json.choices[0].message.content;
          }

          let content = '';
          for (const line of String(text || '').split('\\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;

            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.choices?.[0]?.delta?.content) {
                content += data.choices[0].delta.content;
              }
            } catch {}
          }
          return content.trim();
        }`,
      },
    });

    const startTime = Date.now();
    const result = await provider.callApi('Test prompt');
    const totalTime = Date.now() - startTime;

    // Verify output is correct
    expect(result.output).toBe('Code is poetry in motion');

    // Verify streaming metrics exist
    expect(result.streamingMetrics).toBeDefined();
    expect(result.streamingMetrics?.timeToFirstToken).toBeDefined();
    expect(result.streamingMetrics?.totalStreamTime).toBeDefined();
    expect(result.streamingMetrics?.tokensPerSecond).toBeDefined();
    expect(result.streamingMetrics?.isActuallyStreaming).toBeDefined();

    // Verify isActuallyStreaming is true (6 chunks)
    expect(result.streamingMetrics?.isActuallyStreaming).toBe(true);

    // Verify TTFT is reasonable
    const ttft = result.streamingMetrics!.timeToFirstToken!;
    expect(ttft).toBeGreaterThan(0);
    expect(ttft).toBeLessThan(totalTime + 100); // Allow margin

    // CRITICAL: Verify TTFT includes network time + server processing
    // First chunk arrives at ~100ms (server processing) + network RTT
    // Since we're localhost, RTT is minimal, so TTFT should be ~100-200ms
    expect(ttft).toBeGreaterThanOrEqual(90); // At least server processing time
    expect(ttft).toBeLessThan(500); // But not excessive

    // Verify latencyMs exists and is >= TTFT
    expect(result.latencyMs).toBeDefined();
    expect(result.latencyMs).toBeGreaterThanOrEqual(ttft);

    // Total latency should be ~100ms (first chunk) + 6*50ms (remaining chunks) = ~400ms
    expect(result.latencyMs).toBeGreaterThanOrEqual(300);
    expect(result.latencyMs).toBeLessThan(1000);

    // Verify TTFT is significantly less than total latency (streaming benefit)
    const streamingEfficiency = ttft / result.latencyMs!;
    expect(streamingEfficiency).toBeLessThan(0.5); // TTFT should be < 50% of total time

    // Verify response is not cached
    expect(result.cached).toBe(false);

    console.log('\n✅ End-to-End Test Results:');
    console.log(`   Output: "${result.output}"`);
    console.log(`   TTFT: ${ttft}ms`);
    console.log(`   Total Latency: ${result.latencyMs}ms`);
    console.log(`   Streaming Efficiency: ${(streamingEfficiency * 100).toFixed(1)}%`);
    console.log(`   Is Actually Streaming: ${result.streamingMetrics?.isActuallyStreaming}`);
    console.log(`   Tokens/Second: ${result.streamingMetrics?.tokensPerSecond?.toFixed(1)}`);
  }, 10000);

  it('should handle non-streaming responses without streaming metrics', async () => {
    const provider = new HttpProvider(`${serverUrl}/v1/chat/completions`, {
      config: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          model: 'gpt-4',
          messages: [{ role: 'user', content: '{{prompt}}' }],
          stream: false, // No streaming
        },
      },
    });

    const result = await provider.callApi('Test prompt');

    // Verify output exists (format may vary based on transformResponse)
    expect(result.output).toBeDefined();

    // No streaming metrics for non-streaming responses
    expect(result.streamingMetrics).toBeUndefined();

    // Should still have latencyMs
    expect(result.latencyMs).toBeDefined();
    expect(result.latencyMs).toBeGreaterThan(0);

    console.log('\n✅ Non-Streaming Test Results:');
    console.log(`   Output: "${result.output}"`);
    console.log(`   Latency: ${result.latencyMs}ms`);
    console.log(`   Has Streaming Metrics: ${!!result.streamingMetrics}`);
  });

  it('should ensure TTFT invariant: TTFT <= latencyMs always holds', async () => {
    const provider = new HttpProvider(`${serverUrl}/v1/chat/completions`, {
      config: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          model: 'gpt-4',
          messages: [{ role: 'user', content: '{{prompt}}' }],
          stream: true,
        },
        transformResponse: `(json, text) => {
          if (json?.choices?.[0]?.message?.content) return json.choices[0].message.content;
          let content = '';
          for (const line of String(text || '').split('\\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.choices?.[0]?.delta?.content) content += data.choices[0].delta.content;
            } catch {}
          }
          return content.trim();
        }`,
      },
    });

    // Run 5 requests to verify invariant holds consistently
    const results = await Promise.all(
      Array(5)
        .fill(null)
        .map(() => provider.callApi('Test prompt')),
    );

    results.forEach((result, index) => {
      const ttft = result.streamingMetrics!.timeToFirstToken!;
      const latency = result.latencyMs!;

      // CRITICAL INVARIANT: TTFT must always be <= latency
      expect(ttft).toBeLessThanOrEqual(latency);

      console.log(`   Request ${index + 1}: TTFT=${ttft}ms, Latency=${latency}ms ✓`);
    });

    console.log('\n✅ Invariant holds for all 5 requests');
  }, 30000);
});
