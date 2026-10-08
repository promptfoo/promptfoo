/** Invalid grader configuration must not be treated as a transient grading failure. */
export class RedteamGradingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedteamGradingConfigError';
  }
}
