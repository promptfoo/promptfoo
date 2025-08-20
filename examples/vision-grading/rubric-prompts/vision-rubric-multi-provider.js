/**
 * Multi-provider vision rubric prompt.
 * Detects the provider type and returns the appropriate format.
 */
module.exports = function visionRubricMultiProvider(context, options = {}) {
  const { output, rubric, vars } = context;
  const { provider } = options;
  
  // Detect provider type from the provider ID or config
  const providerType = provider?.id || provider || 'openai';
  
  const textContent = `You are an AI assistant evaluating the quality of an output based on a rubric.

Output to evaluate:
${output}

Rubric:
${rubric}

Evaluate the output based on the rubric. If images are provided, consider them in your evaluation.

Respond with a JSON object containing:
- pass: boolean (whether the output meets the criteria)
- score: number between 0 and 1
- reason: string explaining your evaluation`;
  
  // Collect base64 images from vars
  const images = [];
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === 'string' && value.match(/^[A-Za-z0-9+/]{1000,}={0,2}$/)) {
        images.push(value);
      }
    }
  }
  
  // Format based on provider type
  if (providerType.includes('anthropic') || providerType.includes('claude')) {
    // Anthropic/Claude format
    const content = [
      {
        type: 'text',
        text: textContent
      }
    ];
    
    for (const imageData of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: imageData
        }
      });
    }
    
    return JSON.stringify([
      {
        role: 'user',
        content
      }
    ]);
  } else if (providerType.includes('gemini') || providerType.includes('google')) {
    // Google Gemini format
    const parts = [
      {
        text: textContent
      }
    ];
    
    for (const imageData of images) {
      parts.push({
        inline_data: {
          mime_type: 'image/png',
          data: imageData
        }
      });
    }
    
    return JSON.stringify([
      {
        role: 'user',
        parts
      }
    ]);
  } else if (providerType.includes('nova') || providerType.includes('bedrock')) {
    // Amazon Bedrock Nova format
    const content = [
      {
        text: textContent
      }
    ];
    
    for (const imageData of images) {
      content.push({
        image: {
          format: 'png',
          source: {
            bytes: imageData
          }
        }
      });
    }
    
    return JSON.stringify([
      {
        role: 'user',
        content
      }
    ]);
  } else {
    // Default to OpenAI format
    const content = [
      {
        type: 'text',
        text: textContent
      }
    ];
    
    for (const imageData of images) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${imageData}`
        }
      });
    }
    
    return JSON.stringify([
      {
        role: 'user',
        content
      }
    ]);
  }
};
