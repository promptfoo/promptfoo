export default class CleanupProvider {
  constructor(options) {
    this.options = options;
    if (options.config.fail) {
      throw new Error('provider load failed');
    }
    if (options.config.waitForLoad) {
      return options.config.waitForLoad().then(() => this);
    }
  }

  id() {
    return this.options.id;
  }

  async callApi() {
    await this.options.config.call?.();
    return { output: this.options.config.output ?? 'ok' };
  }

  async cleanup() {
    await this.options.config.cleanup();
  }
}
