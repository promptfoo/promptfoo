/**
 * Custom Promptfoo Provider for Image to Video AI workflows.
 *
 * Demonstrates evaluating asynchronous video generation workflows:
 * - Submitting source image + motion prompt
 * - Polling asynchronous task status until completion
 * - Returning markdown output with video preview links
 * - Exposing structured media metadata (resolution, duration, fps, job status)
 *
 * Environment variables:
 * - IMAGE_TO_VIDEO_AI_API_KEY: API authentication key (optional; runs in simulated demo mode if unset)
 * - IMAGE_TO_VIDEO_AI_BASE_URL: Custom API base URL (default: https://api.imagetovideoai.pro/v1)
 */

const DEFAULT_BASE_URL = 'https://api.imagetovideoai.pro/v1';

class ImageToVideoAiProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'provider-image-to-video-ai';
    this.config = options.config || {};
    this.apiKey = this.config.apiKey || process.env.IMAGE_TO_VIDEO_AI_API_KEY;
    this.baseUrl =
      this.config.baseUrl || process.env.IMAGE_TO_VIDEO_AI_BASE_URL || DEFAULT_BASE_URL;
    this.pollIntervalMs = Number(this.config.pollIntervalMs) || 500;
    this.maxPollAttempts = Number(this.config.maxPollAttempts) || 30;
    this.defaultDuration = Number(this.config.defaultDuration) || 5;
    this.defaultFps = Number(this.config.defaultFps) || 24;
    this.defaultResolution = this.config.defaultResolution || '1280x720';
  }

  id() {
    return this.providerId;
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Main Promptfoo provider invocation.
   *
   * @param {string} prompt - The rendered prompt string
   * @param {object} context - Test context containing variables (vars) and test case info
   * @returns {Promise<{output?: string, error?: string, metadata?: object}>}
   */
  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    const imageUrl =
      vars.imageUrl ||
      this.config.defaultImageUrl ||
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb';
    const motion = vars.motion || this.config.motion || 'cinematic-pan';
    const duration = Number(vars.duration) || this.defaultDuration;
    const fps = Number(vars.fps) || this.defaultFps;
    const resolution = vars.resolution || this.defaultResolution;

    // When no real API key is provided or mock mode is requested, use simulated generation
    // so tests and demo evals run deterministically without external credentials.
    const hasValidApiKey =
      typeof this.apiKey === 'string' &&
      this.apiKey.trim().length > 0 &&
      this.apiKey !== 'undefined' &&
      this.apiKey !== 'null' &&
      !this.apiKey.startsWith('{{') &&
      this.apiKey !== 'YOUR_API_KEY';

    if (
      !hasValidApiKey ||
      this.config.mock === true ||
      process.env.MOCK_IMAGE_TO_VIDEO === 'true'
    ) {
      return this.simulateGeneration({ prompt, imageUrl, motion, duration, fps, resolution });
    }

    try {
      // 1. Submit video generation job
      const submitRes = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          image_url: imageUrl,
          prompt,
          motion_type: motion,
          duration,
          fps,
          resolution,
        }),
      });

      if (!submitRes.ok) {
        const errorText = await submitRes.text();
        return {
          error: `Image to Video API submission failed (HTTP ${submitRes.status}): ${errorText}`,
        };
      }

      const submitData = await submitRes.json();
      const jobId = submitData.task_id || submitData.id || submitData.job_id;

      if (!jobId) {
        return {
          error: 'Image to Video API did not return a valid task identifier.',
        };
      }

      // 2. Poll for job completion
      let attempts = 0;
      let status = submitData.status || 'queued';
      let resultVideoUrl = null;

      while (attempts < this.maxPollAttempts) {
        attempts += 1;
        await this.sleep(this.pollIntervalMs);

        const pollRes = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(jobId)}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        });

        if (!pollRes.ok) {
          const pollError = await pollRes.text();
          return {
            error: `Task status polling failed (HTTP ${pollRes.status}): ${pollError}`,
          };
        }

        const pollData = await pollRes.json();
        status = (pollData.status || '').toLowerCase();

        if (status === 'completed' || status === 'succeeded') {
          resultVideoUrl = pollData.video_url || pollData.result_url || pollData.url;
          break;
        }

        if (status === 'failed' || status === 'error') {
          return {
            error: `Video generation task ${jobId} failed: ${pollData.error || 'Unknown provider error'}`,
            metadata: { jobId, status, attempts },
          };
        }
      }

      if (!resultVideoUrl) {
        return {
          error: `Video generation task ${jobId} timed out after ${attempts} polling attempts.`,
          metadata: { jobId, status, attempts },
        };
      }

      // 3. Return structured output & metadata for assertions
      return {
        output: `[Video Result](${resultVideoUrl})\nStatus: ${status}\nDuration: ${duration}s`,
        metadata: {
          jobId,
          status,
          videoUrl: resultVideoUrl,
          duration,
          resolution,
          fps,
          motion,
          pollAttempts: attempts,
          sourceImageUrl: imageUrl,
        },
      };
    } catch (err) {
      return {
        error: `Unexpected error during image-to-video generation: ${err.message}`,
      };
    }
  }

  /**
   * Deterministic simulation for local verification, CI, and keyless demonstration.
   */
  async simulateGeneration({ prompt, imageUrl, motion, duration, fps, resolution }) {
    // Brief async tick to simulate network round-trip
    await this.sleep(20);

    const slug =
      prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 30) || 'clip';
    const jobId = `job-sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const videoUrl = `https://storage.imagetovideoai.pro/renders/${slug}-${jobId}.mp4`;

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
        pollAttempts: 2,
        sourceImageUrl: imageUrl,
        simulated: true,
      },
    };
  }
}

export default ImageToVideoAiProvider;
export { ImageToVideoAiProvider };
