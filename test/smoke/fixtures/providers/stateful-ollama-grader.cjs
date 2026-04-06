const fs = require('fs');

let loadedModel = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class StatefulOllamaGrader {
  constructor(options) {
    this.config = options.config || {};
    this.modelName = this.config.modelName || 'unknown-grader';
    this.reloadDelayMs = Number(this.config.reloadDelayMs) || 0;
  }

  id() {
    return `stateful-ollama-grader:${this.modelName}`;
  }

  async callApi(prompt) {
    const switchedModel = loadedModel !== this.modelName;
    loadedModel = this.modelName;

    if (switchedModel && this.reloadDelayMs > 0) {
      await sleep(this.reloadDelayMs);
    }

    if (this.config.logPath) {
      fs.appendFileSync(
        this.config.logPath,
        `${JSON.stringify({
          event: 'judge-call',
          modelName: this.modelName,
          switchedModel,
          prompt,
        })}\n`,
      );
    }

    return {
      output: JSON.stringify({
        pass: true,
        score: 1,
        reason: `${this.modelName} graded successfully`,
      }),
    };
  }
}

module.exports = StatefulOllamaGrader;
