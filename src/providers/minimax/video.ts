/** MiniMax H3 video generation provider. */
import { setTimeout as sleep } from 'node:timers/promises';

import { fetchWithProviderProxy, readBoundedText } from '../fetch';
import { buildStorageRefUrl, formatVideoOutput, storeVideoContent } from '../video';

const VIDEO_RATIOS = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const;
type MiniMaxVideoRatio = (typeof VIDEO_RATIOS)[number];
type MediaReference = string | { url: string };

export type MiniMaxVideoContent = {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url';
  text?: string;
  image_url?: MediaReference;
  video_url?: MediaReference;
  audio_url?: MediaReference;
  role?: 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio';
};

export interface MiniMaxVideoOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
  resolution?: '2K';
  ratio?: MiniMaxVideoRatio;
  duration?: number;
  content?: MiniMaxVideoContent[];
  aigc_watermark?: boolean;
  poll_interval_ms?: number;
  max_poll_time_ms?: number;
  headers?: Record<string, string>;
}

type MiniMaxVideoContext = {
  evaluationId?: string;
  prompt?: { config?: unknown };
};

type MiniMaxVideoEnv = Record<string, string | undefined>;

const DEFAULT_API_BASE_URL = 'https://api.minimax.io/v2/video_generation';
const DEFAULT_MODEL = 'MiniMax-H3';
const DEFAULT_RESOLUTION = '2K';
const DEFAULT_DURATION = 6;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_POLL_TIME_MS = 600000;

const VIDEO_CDN_ORIGIN = 'https://cdn.hailuoai.com';
const MAX_VIDEO_BYTES = 128 * 1024 * 1024;
const MAX_JOB_RESPONSE_BYTES = 64 * 1024;
const API_REQUEST_TIMEOUT_MS = 30_000;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 120_000;

function requestOptions(timeoutMs: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return {
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    redirect: 'error' as const,
    skipCloudAuthInjection: true,
    disableTransientRetries: true,
  };
}

async function downloadVideo(videoUrl: string, apiUrl: string, signal?: AbortSignal) {
  const url = URL.parse(videoUrl);
  const apiOrigin = new URL(apiUrl).origin;
  if (
    !url ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.origin !== VIDEO_CDN_ORIGIN && url.origin !== apiOrigin)
  ) {
    throw new Error('MiniMax video download URL does not use an allowed origin.');
  }

  let response: Response;
  try {
    response = await fetchWithProviderProxy(url.href, {
      ...requestOptions(VIDEO_DOWNLOAD_TIMEOUT_MS, signal),
      method: 'GET',
      headers: { 'x-promptfoo-silent': 'true' },
    });
  } catch {
    signal?.throwIfAborted();
    // Fetch errors can include signed CDN URLs.
    throw new Error('MiniMax video download request failed.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`MiniMax video download failed: ${response.status}`);
  }

  const sizeError = 'MiniMax video download exceeds the 128 MiB size limit.';
  if (Number(response.headers.get('content-length')) > MAX_VIDEO_BYTES) {
    await response.body?.cancel();
    throw new Error(sizeError);
  }
  if (!response.body) {
    throw new Error('MiniMax video download returned no body.');
  }

  // Keep an explicit byte limit even if the response omits Content-Length or uses compression.
  const reader = response.body.getReader();
  let buffer = Buffer.alloc(64 * 1024);
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read().catch(() => {
        signal?.throwIfAborted();
        throw new Error('MiniMax video download could not be read.');
      });
      if (done) {
        if (!bytes) {
          throw new Error('MiniMax video download returned no bytes.');
        }
        return buffer.subarray(0, bytes);
      }
      const nextSize = bytes + value.byteLength;
      if (nextSize > MAX_VIDEO_BYTES) {
        throw new Error(sizeError);
      }
      if (nextSize > buffer.length) {
        const next = Buffer.alloc(Math.min(MAX_VIDEO_BYTES, Math.max(nextSize, buffer.length * 2)));
        buffer.copy(next, 0, 0, bytes);
        buffer = next;
      }
      buffer.set(value, bytes);
      bytes = nextSize;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function getApiKey(config: MiniMaxVideoOptions, env?: MiniMaxVideoEnv): string | undefined {
  return config.apiKey || env?.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY;
}

function normalizeContent(prompt: string, content?: MiniMaxVideoContent[]): MiniMaxVideoContent[] {
  if (content?.length) {
    return content;
  }
  return [{ type: 'text', text: prompt }];
}

function getMediaUrl(reference?: MediaReference): string | undefined {
  const url = typeof reference === 'string' ? reference : reference?.url;
  return typeof url === 'string' && url.trim() ? url : undefined;
}

function formatContent(content: MiniMaxVideoContent[]) {
  return content.map((item) => {
    if (item.type === 'text') {
      return item;
    }
    return { ...item, [item.type]: { url: getMediaUrl(item[item.type]) } };
  });
}

function validateContent(content: MiniMaxVideoContent[]): string | undefined {
  for (const item of content) {
    if (!item || !['text', 'image_url', 'video_url', 'audio_url'].includes(item.type)) {
      return 'content items must use text, image_url, video_url, or audio_url types';
    }
    if (item.type === 'text' && !item.text?.trim()) {
      return 'text content must not be empty';
    }
    if (item.type === 'image_url' && !getMediaUrl(item.image_url)) {
      return 'image_url content must include a URL';
    }
    if (item.type === 'video_url' && !getMediaUrl(item.video_url)) {
      return 'video_url content must include a URL';
    }
    if (item.type === 'audio_url' && !getMediaUrl(item.audio_url)) {
      return 'audio_url content must include a URL';
    }
    if (
      item.role &&
      ![
        'first_frame',
        'last_frame',
        'reference_image',
        'reference_video',
        'reference_audio',
      ].includes(item.role)
    ) {
      return `unsupported MiniMax video content role: ${item.role}`;
    }
  }
  return undefined;
}

export class MiniMaxVideoProvider {
  modelName: string;
  config: MiniMaxVideoOptions;
  private providerId?: string;
  env?: MiniMaxVideoEnv;

  constructor(
    modelName: string = DEFAULT_MODEL,
    options: { config?: MiniMaxVideoOptions; id?: string; env?: MiniMaxVideoEnv } = {},
  ) {
    this.modelName = modelName || DEFAULT_MODEL;
    this.config = options.config || {};
    this.providerId = options.id;
    this.env = options.env;
  }

  id(): string {
    return this.providerId || `minimax:video:${this.modelName}`;
  }
  toString(): string {
    return `[MiniMax Video Provider ${this.modelName}]`;
  }

  private getApiUrl(): string {
    const value =
      this.config.apiBaseUrl || process.env.MINIMAX_VIDEO_API_BASE_URL || DEFAULT_API_BASE_URL;
    return value.replace(/\/+$/, '');
  }

  // The provider lifecycle (submit, poll, download, store) is intentionally
  // kept together so every failure maps to a provider error.
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: provider lifecycle intentionally stays together
  async callApi(
    prompt: string,
    context?: MiniMaxVideoContext,
    options?: { abortSignal?: AbortSignal },
  ) {
    const signal = options?.abortSignal;
    const apiKey = getApiKey(this.config, this.env);
    if (!apiKey) {
      return {
        error:
          'MiniMax API key is not set. Set MINIMAX_API_KEY or add apiKey to the provider config.',
      };
    }
    const config = {
      ...this.config,
      ...(context?.prompt?.config as Partial<MiniMaxVideoOptions> | undefined),
    };
    const model = config.model || this.modelName || DEFAULT_MODEL;
    const duration = config.duration ?? DEFAULT_DURATION;
    if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
      return { error: 'MiniMax H3 duration must be an integer between 4 and 15 seconds.' };
    }
    const resolution = config.resolution || DEFAULT_RESOLUTION;
    if (resolution !== '2K') {
      return { error: 'MiniMax H3 resolution must be 2K.' };
    }
    const content = normalizeContent(prompt, config.content);
    const contentError = validateContent(content);
    if (contentError) {
      return { error: contentError };
    }
    const requiresConcreteRatio =
      model === 'MiniMax-H3-Lite' || content.every((item) => item.type === 'text');
    const ratio = config.ratio ?? (requiresConcreteRatio ? '16:9' : 'adaptive');
    if (!VIDEO_RATIOS.includes(ratio) || (ratio === 'adaptive' && requiresConcreteRatio)) {
      return { error: 'MiniMax video requires a supported, concrete aspect ratio for this input.' };
    }
    const body: Record<string, unknown> = {
      model,
      content: formatContent(content),
      resolution,
      duration,
      ratio,
    };
    if (config.aigc_watermark !== undefined) {
      body.aigc_watermark = config.aigc_watermark;
    }
    const headers = new Headers({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...config.headers,
    });
    // The shared transport otherwise clones and reads response bodies for logging.
    headers.set('x-promptfoo-silent', 'true');
    const started = Date.now();
    try {
      const apiUrl = this.getApiUrl();
      const response = await fetchWithProviderProxy(apiUrl, {
        ...requestOptions(API_REQUEST_TIMEOUT_MS, signal),
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = JSON.parse(
        await readBoundedText(response, MAX_JOB_RESPONSE_BYTES, { requireStream: true }),
      );
      if (
        !response.ok ||
        (data?.base_resp?.status_code !== undefined && data.base_resp.status_code !== 0)
      ) {
        return {
          error: `MiniMax video API error: ${data?.base_resp?.status_msg || response.statusText || response.status}`,
        };
      }
      const taskId = data?.task_id;
      if (typeof taskId !== 'string' || !taskId || taskId === '.' || taskId === '..') {
        return { error: 'MiniMax video response did not include task_id.' };
      }
      const queryUrl = new URL(apiUrl);
      queryUrl.pathname = queryUrl.pathname.replace(
        /\/video_generation$/,
        '/query/video_generation',
      );
      queryUrl.pathname += `/${encodeURIComponent(taskId)}`;
      const interval = config.poll_interval_ms ?? DEFAULT_POLL_INTERVAL_MS;
      const timeout = config.max_poll_time_ms ?? DEFAULT_MAX_POLL_TIME_MS;
      const deadline = Date.now() + timeout;
      let videoUrl: string | undefined;
      let taskStatus: string | undefined;
      for (
        let remaining = deadline - Date.now();
        remaining > 0;
        remaining = deadline - Date.now()
      ) {
        const poll = await fetchWithProviderProxy(queryUrl.href, {
          ...requestOptions(Math.min(API_REQUEST_TIMEOUT_MS, remaining), signal),
          method: 'GET',
          headers,
        });
        const statusData = JSON.parse(
          await readBoundedText(poll, MAX_JOB_RESPONSE_BYTES, { requireStream: true }),
        );
        if (
          !poll.ok ||
          (statusData?.base_resp?.status_code && statusData.base_resp.status_code !== 0)
        ) {
          return {
            error: `MiniMax video status error: ${statusData?.base_resp?.status_msg || poll.statusText || poll.status}`,
          };
        }
        const task = statusData?.task || statusData?.data?.task || statusData?.data;
        taskStatus = task?.status;
        const candidateUrl = task?.content?.url || task?.content?.video_url || task?.video_url;
        if (
          typeof candidateUrl === 'string' &&
          candidateUrl &&
          ['succeeded', 'success', 'completed', '2'].includes(String(taskStatus).toLowerCase())
        ) {
          videoUrl = candidateUrl;
          break;
        }
        if (['fail', 'failed', 'error', 'cancelled'].includes(String(taskStatus).toLowerCase())) {
          return { error: `MiniMax video generation failed (status=${taskStatus}).` };
        }
        await sleep(Math.min(interval, Math.max(0, deadline - Date.now())), undefined, { signal });
      }
      if (!videoUrl) {
        return { error: `MiniMax video generation timed out (status=${taskStatus || 'unknown'}).` };
      }
      let video: Buffer;
      try {
        video = await downloadVideo(videoUrl, apiUrl, signal);
      } catch (err) {
        signal?.throwIfAborted();
        return { error: err instanceof Error ? err.message : 'MiniMax video download failed.' };
      }
      const { storageRef, error } = await storeVideoContent(
        video,
        { contentType: 'video/mp4', mediaType: 'video', evalId: context?.evaluationId },
        'MiniMax Video',
      );
      if (error || !storageRef) {
        return { error: error || 'Failed to store MiniMax video.' };
      }
      const url = buildStorageRefUrl(storageRef.key);
      return {
        output: formatVideoOutput(prompt, url),
        latencyMs: Date.now() - started,
        video: {
          id: taskId,
          storageRef: { key: storageRef.key },
          url,
          format: 'mp4',
          duration,
          model,
          resolution,
        },
        metadata: { taskId, status: taskStatus, model, resolution, duration },
      };
    } catch (err) {
      signal?.throwIfAborted();
      return { error: `MiniMax video request failed: ${String(err)}` };
    }
  }
}

export function createMiniMaxVideoProvider(
  providerPath: string,
  options: { config?: MiniMaxVideoOptions; id?: string; env?: MiniMaxVideoEnv } = {},
) {
  const modelName = providerPath.split(':').slice(2).join(':') || DEFAULT_MODEL;
  return new MiniMaxVideoProvider(modelName, options);
}
