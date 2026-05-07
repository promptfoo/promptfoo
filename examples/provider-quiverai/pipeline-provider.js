// GPT Image-2 → QuiverAI vectorize pipeline.
//
// Generates a raster image with OpenAI's gpt-image-2 model, then vectorizes it
// to SVG with QuiverAI Arrow. The whole chain is exposed as a single
// promptfoo provider so it composes with assertions, rubrics, and other
// providers in the same eval.
//
// Required env: OPENAI_API_KEY, QUIVERAI_API_KEY.
// Optional config (set via the provider's config: block in promptfooconfig.yaml):
//   - imageModel:        OpenAI image model id (default: 'gpt-image-2')
//   - imageSize:         Image API size string (default: '1024x1024').
//                        gpt-image-2 also supports 'auto' and custom sizes
//                        allowed by the API.
//   - imageQuality:      'low' | 'medium' | 'high' | 'auto' (default: 'high')
//   - imageBackground:   'transparent' | 'opaque' | 'auto' (default: 'auto').
//                        gpt-image-2 only accepts 'opaque' or 'auto'; gpt-image-1
//                        accepts 'transparent'. We default to 'auto' so the
//                        pipeline works with both models out of the box.
//   - vectorizeModel:    QuiverAI model id (default: 'arrow-1.1')
//   - autoCrop:          boolean — passes auto_crop to the vectorize call
//   - targetSize:        integer pixels — passes target_size to the vectorize call
//   - imageInstructions: optional suffix appended to the user prompt
//
// Returns:
//   output:   the SVG markup
//   metadata: { rasterB64Length, rasterModel, svgModel, credits, responseId }
//   raw:      { rasterB64, svg } for downstream artifact handling

const QUIVERAI_BASE_URL = process.env.QUIVERAI_API_BASE_URL || 'https://api.quiver.ai/v1';
const OPENAI_BASE_URL = process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1';

class GptImageToQuiverPipeline {
  constructor(options = {}) {
    this.providerId = options.id || 'pipeline:gpt-image-2->quiverai-vectorize';
    this.config = options.config || {};
    this.openaiKey = process.env.OPENAI_API_KEY;
    this.quiverKey = process.env.QUIVERAI_API_KEY;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    if (!this.openaiKey) {
      return { error: 'OPENAI_API_KEY is not set; required for the raster step.' };
    }
    if (!this.quiverKey) {
      return { error: 'QUIVERAI_API_KEY is not set; required for the vectorize step.' };
    }

    const fullPrompt = this.config.imageInstructions
      ? `${prompt}\n\n${this.config.imageInstructions}`
      : prompt;

    let rasterB64;
    try {
      rasterB64 = await this.generateRaster(fullPrompt);
    } catch (err) {
      return {
        error: `OpenAI image step failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    let vectorized;
    try {
      vectorized = await this.vectorize(rasterB64);
    } catch (err) {
      return {
        error: `QuiverAI vectorize step failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    return {
      output: vectorized.svg,
      raw: { rasterB64, svg: vectorized.svg },
      metadata: {
        rasterModel: this.config.imageModel || 'gpt-image-2',
        rasterB64Length: rasterB64.length,
        svgModel: this.config.vectorizeModel || 'arrow-1.1',
        credits: vectorized.credits,
        responseId: vectorized.responseId,
      },
    };
  }

  async generateRaster(prompt) {
    const body = {
      model: this.config.imageModel || 'gpt-image-2',
      prompt,
      size: this.config.imageSize || '1024x1024',
      quality: this.config.imageQuality || 'high',
      background: this.config.imageBackground || 'auto',
      n: 1,
    };
    const res = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('OpenAI response missing b64_json');
    }
    return b64;
  }

  async vectorize(rasterB64) {
    const body = {
      model: this.config.vectorizeModel || 'arrow-1.1',
      image: { base64: rasterB64 },
      stream: false,
      ...(this.config.autoCrop !== undefined && { auto_crop: this.config.autoCrop }),
      ...(this.config.targetSize && { target_size: this.config.targetSize }),
    };
    const res = await fetch(`${QUIVERAI_BASE_URL}/svgs/vectorizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.quiverKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const json = await res.json();
    const svg = json?.data?.[0]?.svg;
    if (!svg) {
      throw new Error('QuiverAI response missing data[0].svg');
    }
    return { svg, credits: json.credits, responseId: json.id };
  }
}

module.exports = GptImageToQuiverPipeline;
