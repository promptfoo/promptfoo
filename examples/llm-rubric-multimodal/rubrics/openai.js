/**
 * OpenAI Vision LLM-Rubric
 * Formats the rubric evaluation prompt with images for OpenAI vision models
 */
module.exports = function openaiVisionRubric(output, rubric, vars) {
  const messageContent = [
    {
      type: 'text',
      text: `You are evaluating an AI model's output based on a specific rubric.

Output to evaluate:
${output}

Evaluation Rubric:
${rubric}

Please evaluate the output against the rubric. If images are provided, consider them in your evaluation.

Respond with a JSON object:
{
  "pass": <boolean>,
  "score": <number between 0 and 1>,
  "reason": "<detailed explanation of your evaluation>"
}`
    }
  ];

  // Add images from vars
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      // Check for base64 image data
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

  return JSON.stringify([
    {
      role: 'user',
      content: messageContent
    }
  ]);
};
