/**
 * Google Gemini Vision LLM-Rubric
 * Formats the rubric evaluation prompt with images for Gemini vision models
 */
module.exports = function geminiVisionRubric(output, rubric, vars) {
  const parts = [
    {
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
        parts.push({
          inline_data: {
            mime_type: 'image/png',
            data: value
          }
        });
      }
    }
  }

  return JSON.stringify([
    {
      role: 'user',
      parts: parts
    }
  ]);
};
