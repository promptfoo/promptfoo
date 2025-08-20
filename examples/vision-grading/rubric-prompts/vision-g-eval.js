/**
 * Custom G-Eval rubric prompt for vision-based grading.
 * For G-Eval, we need to provide the evaluation prompt that includes images.
 * Note: G-Eval handles the two-step process internally, we just customize the evaluate step.
 */
module.exports = function visionGEvalPrompt(criteria, steps, maxScore, input, output, vars) {
  // Build the message content
  const messageContent = [
    {
      type: 'text',
      text: `You will be given an evaluation criteria, a list of evaluation steps, the input prompt and AI model's response.

Evaluation Criteria:
${criteria}

Evaluation Steps:
${steps}

Input Prompt:
${input}

AI Model's Response:
${output}

Please evaluate the AI model's response based on the given evaluation criteria and steps. Consider any images provided in your evaluation.

Assign a score from 1 to ${maxScore} for the AI model's response, with 1 being the lowest and ${maxScore} being the highest.

Respond with a JSON object containing:
{
  "score": <int>,
  "reason": "<string explaining your evaluation>"
}`
    }
  ];
  
  // Add images from input if it contains them
  try {
    const parsedInput = JSON.parse(input);
    if (Array.isArray(parsedInput)) {
      for (const message of parsedInput) {
        if (message.content && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'image_url' && part.image_url?.url) {
              messageContent.push({
                type: 'image_url',
                image_url: part.image_url
              });
            }
          }
        }
      }
    }
  } catch {
    // Input is not JSON, check vars for images
    if (vars) {
      for (const [key, value] of Object.entries(vars)) {
        if (typeof value === 'string' && value.match(/^[A-Za-z0-9+/]{1000,}={0,2}$/)) {
          messageContent.push({
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${value}`
            }
          });
        }
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
