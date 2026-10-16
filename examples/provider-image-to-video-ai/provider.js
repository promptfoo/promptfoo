/**
 * Generic Custom Promptfoo Provider for Asynchronous Image to Video AI workflows.
 *
 * Demonstrates evaluating asynchronous video generation workflows:
 * - Submitting source image + motion prompt
 * - Polling asynchronous task status until completion
 * - Propagating cancellation via AbortSignal and bounding overall execution time
 * - Returning markdown output with video preview links
 * - Exposing observed media metadata (resolution, duration, fps) vs requested settings
 *
 * Environment variables:
 * - IMAGE_TO_VIDEO_AI_API_KEY: Optional API key for live provider integration
 * - IMAGE_TO_VIDEO_AI_BASE_URL: Custom API base URL (default: https://api.example.com/v1)
 *
 * By default runs as an explicitly generic local simulation without external network calls.
 */

const DEFAULT_BASE_URL = 'https://api.example.com/v1';

class ImageToVideoAiProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'provider-image-to-video-ai';
    this.config = options.config || {};
    this.apiKey = this.config.apiKey || process.env.IMAGE_TO_VIDEO_AI_API_KEY;
    this.baseUrl =
      this.config.baseUrl || process.env.IMAGE_TO_VIDEO_AI_BASE_URL || DEFAULT_BASE_URL;
    this.pollIntervalMs = Number(this.config.pollIntervalMs) || 500;
    this.maxPollAttempts = Number(this.config.maxPollAttempts) || 30;
    this.timeoutMs = Number(this.config.timeoutMs) || 60000;
    this.defaultDuration = Number(this.config.defaultDuration) || 5;
    this.defaultFps = Number(this.config.defaultFps) || 24;
    this.defaultResolution = this.config.defaultResolution || '1280x720';
  }

  id() {
    return this.providerId;
  }

  async sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason || new Error('Request aborted'));
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason || new Error('Request aborted'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  hasValidApiKey() {
    return (
      typeof this.apiKey === 'string' &&
      this.apiKey.trim().length > 0 &&
      !['undefined', 'null', 'YOUR_API_KEY'].includes(this.apiKey) &&
      !this.apiKey.startsWith('{{')
    );
  }

  async submitJob(body, signal) {
    const res = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const errorText = await res.text();
      return { error: `Image to Video API submission failed (HTTP ${res.status}): ${errorText}` };
    }
    const data = await res.json();
    const jobId = data.task_id || data.id || data.job_id;
    if (!jobId) {
      return { error: 'Image to Video API did not return a valid task identifier.' };
    }
    return { jobId, status: data.status || 'queued' };
  }

  async pollUntilComplete(jobId, signal) {
    let attempts = 0;
    while (attempts < this.maxPollAttempts) {
      attempts += 1;
      await this.sleep(this.pollIntervalMs, signal);

      const res = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal,
      });

      if (!res.ok) {
        const pollError = await res.text();
        return { error: `Task status polling failed (HTTP ${res.status}): ${pollError}` };
      }

      const data = await res.json();
      const status = (data.status || '').toLowerCase();

      if (status === 'completed' || status === 'succeeded') {
        // shortcut: parses media fields from response payload without probing remote file; upgrade if provider omits metadata
        const media = data.metadata || data.output || data.media || {};
        return {
          status,
          videoUrl: data.video_url || data.result_url || data.url,
          observedDuration: data.duration ?? media.duration ?? null,
          observedFps: data.fps ?? media.fps ?? null,
          observedResolution: data.resolution ?? media.resolution ?? null,
          observedMotion: data.motion_type ?? data.motion ?? media.motion ?? null,
          attempts,
        };
      }

      if (status === 'failed' || status === 'error') {
        return {
          error: `Video generation task ${jobId} failed: ${data.error || 'Unknown provider error'}`,
          metadata: { jobId, status, attempts },
        };
      }
    }

    return {
      error: `Video generation task ${jobId} timed out after ${attempts} polling attempts.`,
      metadata: { jobId, status: 'processing', attempts },
    };
  }

  /**
   * Main Promptfoo provider invocation.
   *
   * @param {string} prompt - The rendered prompt string
   * @param {object} context - Test context containing variables (vars) and test case info
   * @param {object} options - Call options including abortSignal and timeoutMs
   * @returns {Promise<{output?: string, error?: string, metadata?: object}>}
   */
  async callApi(prompt, context = {}, options = {}) {
    if (options?.abortSignal?.aborted) {
      return { error: 'Request aborted' };
    }

    const vars = context.vars || {};
    const imageUrl =
      vars.imageUrl ||
      this.config.defaultImageUrl ||
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb';
    const motion = vars.motion || this.config.motion || 'cinematic-pan';
    const duration = Number(vars.duration) || this.defaultDuration;
    const fps = Number(vars.fps) || this.defaultFps;
    const resolution = vars.resolution || this.defaultResolution;

    const requested = {
      prompt,
      imageUrl,
      motion,
      duration,
      fps,
      resolution,
    };

    if (
      !this.hasValidApiKey() ||
      this.config.mock === true ||
      process.env.MOCK_IMAGE_TO_VIDEO === 'true'
    ) {
      return this.simulateGeneration(requested, options);
    }

    const timeoutMs = Number(options?.timeoutMs) || this.timeoutMs;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort(new Error(`Video generation timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    const combinedSignal = options?.abortSignal
      ? AbortSignal.any([options.abortSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const submit = await this.submitJob(
        {
          image_url: imageUrl,
          prompt,
          motion_type: motion,
          duration,
          fps,
          resolution,
        },
        combinedSignal,
      );

      if (submit.error) {
        return { error: submit.error };
      }

      const poll = await this.pollUntilComplete(submit.jobId, combinedSignal);
      if (poll.error) {
        return { error: poll.error, ...(poll.metadata && { metadata: poll.metadata }) };
      }

      const durationText =
        poll.observedDuration == null ? '' : `\nDuration: ${poll.observedDuration}s`;

      return {
        output: `[Video Result](${poll.videoUrl})\nStatus: ${poll.status}${durationText}`,
        metadata: {
          jobId: submit.jobId,
          status: poll.status,
          videoUrl: poll.videoUrl,
          duration: poll.observedDuration,
          resolution: poll.observedResolution,
          fps: poll.observedFps,
          motion: poll.observedMotion,
          pollAttempts: poll.attempts,
          sourceImageUrl: imageUrl,
          requestedDuration: duration,
          requestedResolution: resolution,
          requestedFps: fps,
          requestedMotion: motion,
          requested,
        },
      };
    } catch (err) {
      if (options?.abortSignal?.aborted || err?.name === 'AbortError') {
        return { error: 'Request aborted' };
      }
      if (timeoutController.signal.aborted) {
        return { error: `Video generation timed out after ${timeoutMs}ms.` };
      }
      return {
        error: `Unexpected error during image-to-video generation: ${err.message}`,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Deterministic generic simulation for local verification, CI, and keyless demonstration.
   */
  async simulateGeneration(requested, options = {}) {
    if (options?.abortSignal?.aborted) {
      return { error: 'Request aborted' };
    }
    await this.sleep(20, options?.abortSignal);

    const { prompt, imageUrl, motion, duration, fps, resolution } = requested;
    const slug =
      prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 30) || 'clip';
    const jobId = `job-sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const videoUrl = `https://example.com/simulated-renders/${slug}-${jobId}.mp4`;

    return {
      output: `[Video Result](${videoUrl})\nStatus: completed\nDuration: ${duration}s`,
      metadata: {
        jobId,
        status: 'completed',
        videoUrl,
        duration,
        resolution,
        fps,
        motion,
        pollAttempts: 1,
        sourceImageUrl: imageUrl,
        simulated: true,
        requestedDuration: duration,
        requestedResolution: resolution,
        requestedFps: fps,
        requestedMotion: motion,
        requested,
      },
    };
  }
}

export default ImageToVideoAiProvider;
export { ImageToVideoAiProvider };
