/**
 * Custom error class for ElevenLabs API errors
 */
export class ElevenLabsAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public data?: any,
  ) {
    super(message);
    this.name = 'ElevenLabsAPIError';
  }
}

/**
 * Error thrown when ElevenLabs API rate limit is exceeded
 */
export class ElevenLabsRateLimitError extends ElevenLabsAPIError {
  constructor(
    message: string,
    public retryAfter?: number,
  ) {
    super(message, 429);
    this.name = 'ElevenLabsRateLimitError';
  }
}

/**
 * Error thrown when authentication fails
 */
export class ElevenLabsAuthError extends ElevenLabsAPIError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'ElevenLabsAuthError';
  }
}
