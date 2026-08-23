/** MiniMax H3 video generation provider. */
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import { sleep } from '../../util/time';
import { buildStorageRefUrl, formatVideoOutput, storeVideoContent } from '../video';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';

export type MiniMaxVideoContent = {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url';
  text?: string;
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  role?: 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio';
};

export interface MiniMaxVideoOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
  resolution?: '2K';
  duration?: number;
  content?: MiniMaxVideoContent[];
  aigc_watermark?: boolean;
  poll_interval_ms?: number;
  max_poll_time_ms?: number;
  headers?: Record<string, string>;
}

const DEFAULT_API_BASE_URL = 'https://api.minimax.io/v2/video_generation';
const DEFAULT_MODEL = 'MiniMax-H3';
const DEFAULT_RESOLUTION = '2K';
const DEFAULT_DURATION = 6;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_POLL_TIME_MS = 600000;
const _VALID_RATIOS = new Set(['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);

function getApiKey(config: MiniMaxVideoOptions, env?: EnvOverrides): string | undefined {
  return config.apiKey || env?.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY;
}

function normalizeContent(prompt: string, content?: MiniMaxVideoContent[]): MiniMaxVideoContent[] {
  if (content?.length) {
    return content;
  }
  return [{ type: 'text', text: prompt }];
}

function validateContent(content: MiniMaxVideoContent[]): string | undefined {
  for (const item of content) {
    if (!item || !['text', 'image_url', 'video_url', 'audio_url'].includes(item.type)) {
      return 'content items must use text, image_url, video_url, or audio_url types';
    }
    if (item.type === 'text' && !item.text?.trim()) {
      return 'text content must not be empty';
    }
    if (item.type === 'image_url' && !item.image_url) {
      return 'image_url content must include a URL';
    }
    if (item.type === 'video_url' && !item.video_url) {
      return 'video_url content must include a URL';
    }
    if (item.type === 'audio_url' && !item.audio_url) {
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

export class MiniMaxVideoProvider implements ApiProvider {
  modelName: string;
  config: MiniMaxVideoOptions;
  private providerId?: string;
  env?: EnvOverrides;

  constructor(
    modelName: string = DEFAULT_MODEL,
    options: { config?: MiniMaxVideoOptions; id?: string; env?: EnvOverrides } = {},
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
    context?: CallApiContextParams,
    _options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
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
    const body: Record<string, unknown> = { model, content, resolution, duration };
    if (config.aigc_watermark !== undefined) {
      body.aigc_watermark = config.aigc_watermark;
    }
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...config.headers,
    };
    const started = Date.now();
    try {
      const response = await fetchWithProxy(this.getApiUrl(), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as any;
      if (
        !response.ok ||
        (data?.base_resp?.status_code !== undefined && data.base_resp.status_code !== 0)
      ) {
        return {
          error: `MiniMax video API error: ${data?.base_resp?.status_msg || response.statusText || response.status}`,
        };
      }
      const taskId = data?.task_id;
      if (!taskId) {
        return { error: 'MiniMax video response did not include task_id.' };
      }
      const queryUrl = `${this.getApiUrl().replace('/video_generation', '/query/video_generation')}?task_id=${encodeURIComponent(taskId)}`;
      const interval = config.poll_interval_ms ?? DEFAULT_POLL_INTERVAL_MS;
      const timeout = config.max_poll_time_ms ?? DEFAULT_MAX_POLL_TIME_MS;
      const deadline = Date.now() + timeout;
      let videoUrl: string | undefined;
      let taskStatus: string | undefined;
      while (Date.now() < deadline) {
        const poll = await fetchWithProxy(queryUrl, { method: 'GET', headers });
        const statusData = (await poll.json().catch(() => ({}))) as any;
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
        videoUrl = task?.content?.url || task?.content?.video_url || task?.video_url;
        if (videoUrl && ['Success', 'success', 'completed', '2'].includes(String(taskStatus))) {
          break;
        }
        if (['Fail', 'Failed', 'failed', 'error'].includes(String(taskStatus))) {
          return { error: `MiniMax video generation failed (status=${taskStatus}).` };
        }
        await sleep(interval);
      }
      if (!videoUrl) {
        return { error: `MiniMax video generation timed out (status=${taskStatus || 'unknown'}).` };
      }
      const download = await fetchWithProxy(videoUrl, { method: 'GET' });
      if (!download.ok) {
        return { error: `MiniMax video download failed: ${download.status}` };
      }
      const { storageRef, error } = await storeVideoContent(
        Buffer.from(await download.arrayBuffer()),
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
        cost: 0,
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
      logger.debug('[MiniMax Video] request failed', { error: String(err) });
      return { error: `MiniMax video request failed: ${String(err)}` };
    }
  }
}

export function createMiniMaxVideoProvider(
  providerPath: string,
  options: { config?: MiniMaxVideoOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const modelName = providerPath.split(':').slice(2).join(':') || DEFAULT_MODEL;
  return new MiniMaxVideoProvider(modelName, options);
}
