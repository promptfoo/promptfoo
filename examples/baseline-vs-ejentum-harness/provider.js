/**
 * Custom promptfoo provider that pre-fetches a cognitive scaffold from the
 * Ejentum Logic API for the given mode, then calls OpenAI with the scaffold
 * stitched into the system message. The baseline provider in the same config
 * uses plain openai:gpt-4o-mini so the eval table makes the lift visible.
 */

// The Ejentum Logic API base URL. Resolved in priority order:
//   1. `config.apiUrl` from the provider block in promptfooconfig.yaml
//   2. `EJENTUM_API_URL` environment variable
//   3. The default published endpoint below
// This pattern (config -> env -> default) is the transferable lesson:
// it lets readers point this provider at a staging endpoint, a self-hosted
// prompt-augmentation service, or any other compatible API without editing code.
const DEFAULT_EJENTUM_URL = 'https://ejentum-main-ab125c3.zuplo.app/logicv1/';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

class EjentumAugmentedProvider {
  constructor(options = {}) {
    this.config = options.config || {};
    this.providerId =
      options.id || `ejentum:${this.config.mode || 'reasoning'}`;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    const ejentumKey = process.env.EJENTUM_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!ejentumKey) {
      return {
        error:
          'EJENTUM_API_KEY is not set. Get a key at https://ejentum.com/dashboard',
      };
    }
    if (!openaiKey) {
      return { error: 'OPENAI_API_KEY is not set.' };
    }

    const mode = this.config.mode || 'reasoning';
    const model = this.config.model || 'gpt-4o-mini';
    const temperature =
      this.config.temperature !== undefined ? this.config.temperature : 0;
    const ejentumUrl =
      this.config.apiUrl || process.env.EJENTUM_API_URL || DEFAULT_EJENTUM_URL;

    // Step 1: fetch the cognitive scaffold for this task.
    let scaffold = '';
    try {
      const r = await fetch(ejentumUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ejentumKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: prompt, mode }),
      });
      if (!r.ok) {
        return { error: `Ejentum API ${r.status}: ${await r.text()}` };
      }
      const body = await r.json();
      scaffold = Array.isArray(body) && body[0] ? body[0][mode] || '' : '';
    } catch (err) {
      return { error: `Ejentum fetch failed: ${String(err)}` };
    }

    // Step 2: call OpenAI with the scaffold as a prefix to the system message.
    try {
      const r = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature,
          messages: [
            {
              role: 'system',
              content:
                `Apply the cognitive scaffold below, then answer the user's task.\n\n` +
                `[COGNITIVE SCAFFOLD]\n${scaffold}\n[END SCAFFOLD]`,
            },
            { role: 'user', content: prompt },
          ],
        }),
      });
      const body = await r.json();
      if (!r.ok || body.error) {
        return {
          error: `OpenAI error: ${body.error?.message || r.status}`,
        };
      }
      return {
        output: body.choices?.[0]?.message?.content || '',
        tokenUsage: {
          prompt: body.usage?.prompt_tokens || 0,
          completion: body.usage?.completion_tokens || 0,
          total: body.usage?.total_tokens || 0,
        },
      };
    } catch (err) {
      return { error: `OpenAI fetch failed: ${String(err)}` };
    }
  }
}

module.exports = EjentumAugmentedProvider;
