/**
 * Amazon Bedrock Nova Vision LLM-Rubric
 * Formats the rubric evaluation prompt with images for Nova vision models
 */
module.exports = function novaVisionRubric(output, rubric, vars) {
  const content = [
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
