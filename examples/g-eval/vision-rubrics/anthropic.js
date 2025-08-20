/**
 * Anthropic Claude Vision G-Eval Rubric
 * Formats the evaluation prompt with images for Claude vision models
 */
module.exports = function anthropicVisionGEval(criteria, steps, maxScore, input, output, vars) {
  const messageContent = [
    {
      type: 'text',
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

  // Extract images from structured input (Anthropic format)
  if (typeof input === 'string' && input.startsWith('[')) {
    try {
      const messages = JSON.parse(input);
      for (const msg of messages) {
        if (msg.content && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === 'image' && part.source?.data) {
              messageContent.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: part.source.media_type || 'image/png',
                  data: part.source.data
                }
              });
            }
            // Also check for OpenAI format and convert
            else if (part.type === 'image_url' && part.image_url?.url) {
              const match = part.image_url.url.match(/^data:image\/(\w+);base64,(.+)$/);
              if (match) {
                messageContent.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: `image/${match[1]}`,
                    data: match[2]
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
        messageContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: value
          }
        });
      }
    }
  }

  return JSON.stringify([
    {
      role: 'user',
      content: messageContent
    }
  ]);
};
