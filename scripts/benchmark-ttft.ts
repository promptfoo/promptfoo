#!/usr/bin/env tsx
/**
 * TTFT benchmark — reproduces the framing-gap and throughput numbers
 * cited in the TTFT PR description.
 *
 * For each configured endpoint, sends N streaming requests and records:
 *  - wire TTFT     (first non-whitespace body byte)  — default detector
 *  - content TTFT  (first content delta)              — streamFormat preset
 *  - total latency (request dispatch to last byte)
 *  - stream window (first byte to last byte)
 *  - completion chars + chars/4 throughput
 *
 * Reports per-endpoint percentiles for each metric and the mean
 * wire-vs-content gap. Meant to be run locally; results are ephemeral.
 *
 * Usage:
 *   OPENAI_API_KEY=... tsx scripts/benchmark-ttft.ts [samples]
 *
 * The [samples] arg defaults to 8 per endpoint.
 *
 * Intentionally standalone (no promptfoo imports) so it can be run from
 * any checkout as an independent rig. This is the reference implementation
 * for the gap numbers cited in the StreamingMetrics JSDoc.
 */

type FirstTokenDetector = (accumulatedText: string) => boolean;

interface Sample {
  wireTtftMs: number | undefined;
  contentTtftMs: number | undefined;
  totalLatencyMs: number;
  streamWindowMs: number | undefined;
  completionChars: number;
  charsPerSecond: number | undefined;
  chunkCount: number;
}

interface Endpoint {
  label: string;
  url: string;
  body: Record<string, unknown>;
  // Detector returns true when the accumulated raw SSE text first contains
  // a non-empty content token for this protocol.
  contentDetector: FirstTokenDetector;
  // Pull the final content string out of the accumulated SSE buffer.
  parseContent: (accumulatedText: string) => string;
}

const DETECTORS = {
  openaiChat: (buf: string) => /"delta":\s*\{[^}]*"content":"[^"]/.test(buf),
  openaiResponses: (buf: string) =>
    /"type":\s*"response\.output_text\.delta"[\s\S]*?"delta":"[^"]/.test(buf),
  anthropicMessages: (buf: string) => /"type":\s*"text_delta"[\s\S]*?"text":"[^"]/.test(buf),
};

function parseOpenAIChat(text: string): string {
  let out = '';
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data: ') || t === 'data: [DONE]') {
      continue;
    }
    try {
      const evt = JSON.parse(t.slice(6));
      const c = evt.choices?.[0]?.delta?.content;
      if (typeof c === 'string') {
        out += c;
      }
    } catch {}
  }
  return out;
}

function parseOpenAIResponses(text: string): string {
  let out = '';
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data: ')) {
      continue;
    }
    try {
      const evt = JSON.parse(t.slice(6));
      if (evt.type === 'response.output_text.delta' && typeof evt.delta === 'string') {
        out += evt.delta;
      }
    } catch {}
  }
  return out;
}

async function sampleOnce(
  endpoint: Endpoint,
  apiKey: string,
  authHeader = 'Authorization',
  authPrefix = 'Bearer ',
): Promise<Sample> {
  const requestStart = performance.now();
  // biome-ignore lint/style/noRestrictedGlobals: standalone benchmark; must not use fetchWithProxy
  const res = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [authHeader]: authPrefix + apiKey,
    },
    body: JSON.stringify({ ...endpoint.body, stream: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `${endpoint.label}: HTTP ${res.status} ${res.statusText}\n${body.slice(0, 400)}`,
    );
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let wireTtftMs: number | undefined;
  let contentTtftMs: number | undefined;
  let firstByteMs: number | undefined;
  let lastByteMs: number | undefined;
  let accumulated = '';
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const now = performance.now();
    if (firstByteMs === undefined) {
      firstByteMs = now;
    }
    lastByteMs = now;

    const chunk = decoder.decode(value, { stream: true });
    accumulated += chunk;
    chunkCount++;

    if (wireTtftMs === undefined) {
      for (let i = 0; i < chunk.length; i++) {
        if (chunk.charCodeAt(i) > 32) {
          wireTtftMs = now - requestStart;
          break;
        }
      }
    }
    if (contentTtftMs === undefined && endpoint.contentDetector(accumulated)) {
      contentTtftMs = now - requestStart;
    }
  }
  const totalLatencyMs = performance.now() - requestStart;
  const streamWindowMs =
    firstByteMs !== undefined && lastByteMs !== undefined ? lastByteMs - firstByteMs : undefined;
  const content = endpoint.parseContent(accumulated);
  const charsPerSecond =
    streamWindowMs && streamWindowMs >= 50 ? (content.length / streamWindowMs) * 1000 : undefined;

  return {
    wireTtftMs,
    contentTtftMs,
    totalLatencyMs,
    streamWindowMs,
    completionChars: content.length,
    charsPerSecond,
    chunkCount,
  };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function formatSamples(label: string, samples: Sample[]): string {
  const wire = samples.map((s) => s.wireTtftMs ?? 0);
  const content = samples.map((s) => s.contentTtftMs ?? 0);
  const latency = samples.map((s) => s.totalLatencyMs);
  const stream = samples.map((s) => s.streamWindowMs ?? 0).filter((v) => v > 0);
  const cps = samples.map((s) => s.charsPerSecond ?? 0).filter((v) => v > 0);
  const gaps = samples
    .filter((s) => s.wireTtftMs !== undefined && s.contentTtftMs !== undefined)
    .map((s) => s.contentTtftMs! - s.wireTtftMs!);

  const fmt = (vs: number[]) =>
    vs.length === 0
      ? '—'
      : `p50=${percentile(vs, 0.5).toFixed(0)}  p90=${percentile(vs, 0.9).toFixed(0)}  max=${percentile(vs, 1.0).toFixed(0)}`;

  const mean = (vs: number[]) => (vs.length === 0 ? 0 : vs.reduce((a, b) => a + b, 0) / vs.length);

  return [
    `── ${label} (n=${samples.length})`,
    `   wire TTFT (ms):    ${fmt(wire)}`,
    `   content TTFT (ms): ${fmt(content)}`,
    `   latency (ms):      ${fmt(latency)}`,
    `   stream win (ms):   ${fmt(stream)}`,
    `   chars/sec:         ${fmt(cps)}`,
    `   wire→content gap:  ${fmt(gaps)}  mean=${mean(gaps).toFixed(1)}ms`,
    `   chunk count range: ${Math.min(...samples.map((s) => s.chunkCount))}-${Math.max(...samples.map((s) => s.chunkCount))}`,
  ].join('\n');
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is required.');
    process.exit(1);
  }
  const samples = Number.parseInt(process.argv[2] ?? '8', 10);

  const prompt = 'Write a 200-word explanation of how rainbows form.';

  const endpoints: Endpoint[] = [
    {
      label: 'chat / gpt-4o-mini',
      url: 'https://api.openai.com/v1/chat/completions',
      body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] },
      contentDetector: DETECTORS.openaiChat,
      parseContent: parseOpenAIChat,
    },
    {
      label: 'chat / gpt-4o',
      url: 'https://api.openai.com/v1/chat/completions',
      body: { model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] },
      contentDetector: DETECTORS.openaiChat,
      parseContent: parseOpenAIChat,
    },
    {
      label: 'responses / gpt-5.4-mini',
      url: 'https://api.openai.com/v1/responses',
      body: { model: 'gpt-5.4-mini', input: prompt },
      contentDetector: DETECTORS.openaiResponses,
      parseContent: parseOpenAIResponses,
    },
    {
      label: 'responses / gpt-5.4',
      url: 'https://api.openai.com/v1/responses',
      body: { model: 'gpt-5.4', input: prompt },
      contentDetector: DETECTORS.openaiResponses,
      parseContent: parseOpenAIResponses,
    },
  ];

  console.log(`Running ${samples} samples per endpoint...\n`);

  for (const endpoint of endpoints) {
    const results: Sample[] = [];
    for (let i = 0; i < samples; i++) {
      try {
        results.push(await sampleOnce(endpoint, apiKey));
        process.stderr.write('.');
      } catch (e) {
        process.stderr.write('!');
        console.error(`\n${(e as Error).message}`);
      }
    }
    process.stderr.write('\n');
    if (results.length > 0) {
      console.log(formatSamples(endpoint.label, results));
      console.log('');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
