/**
 * Amazon Bedrock Nova Vision G-Eval Rubric
 * Formats the evaluation prompt with images for Nova vision models
 */
module.exports = function novaVisionGEval(criteria, steps, maxScore, input, output, vars) {
  const content = [
    {
      text: `You will evaluate an AI model's response based on the given criteria and steps.

Evaluation Criteria:
${criteria}

Evaluation Steps:
${steps}

Input Prompt:
${typeof input === 'string' && input.startsWith('[') ? 'Visual prompt with image(s)' : input}

AI Model's Response:
${output}

Please evaluate the AI model's response based on the criteria and steps. Consider any images provided.

Assign a score from 1 to ${maxScore} (1=lowest, ${maxScore}=highest).

Respond with JSON:
{
  "score": <int>,
  "reason": "<explanation>"
}`
    }
  ];

  // Extract images from structured input (Nova format)
  if (typeof input === 'string' && input.startsWith('[')) {
    try {
      const messages = JSON.parse(input);
      for (const msg of messages) {
        if (msg.content && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            // Check for Nova format
            if (part.image?.source?.bytes) {
              content.push({
                image: {
                  format: part.image.format || 'png',
                  source: {
                    bytes: part.image.source.bytes
                  }
                }
              });
            }
            // Convert from OpenAI format
            else if (part.type === 'image_url' && part.image_url?.url) {
              const match = part.image_url.url.match(/^data:image\/(\w+);base64,(.+)$/);
              if (match) {
                content.push({
                  image: {
                    format: match[1],
                    source: {
                      bytes: match[2]
                    }
                  }
                });
              }
            }
          }
        }
      }
    } catch (e) {
      // Input parsing failed
    }
  }

  // Add images from vars
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === 'string' && value.match(/^[A-Za-z0-9+/]{1000,}={0,2}$/)) {
        content.push({
          image: {
            format: 'png',
            source: {
              bytes: value
            }
          }
        });
      }
    }
  }

  return JSON.stringify([
    {
      role: 'user',
      content: content
    }
  ]);
};
