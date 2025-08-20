/**
 * Custom rubric prompt for vision-based LLM grading.
 * This function generates a properly formatted message array with images
 * for vision-capable grading models.
 */
module.exports = function visionLlmRubricPrompt(output, rubric, vars) {
  // Arguments are passed directly: output, rubric, vars
  
  // Build the message content array
  const messageContent = [
    {
      type: 'text',
      text: `You are an AI assistant evaluating the quality of an output based on a rubric.

Output to evaluate:
${output}

Rubric:
${rubric}

Evaluate the output based on the rubric. If images are provided, consider them in your evaluation.

Respond with a JSON object containing:
- pass: boolean (whether the output meets the criteria)
- score: number between 0 and 1
- reason: string explaining your evaluation`
    }
  ];
  
  // Add any images from vars
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === 'string' && value.match(/^[A-Za-z0-9+/]{1000,}={0,2}$/)) {
        // This is likely base64 image data
        messageContent.push({
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${value}`
          }
        });
      }
    }
  }
  
  // Return the properly formatted message for OpenAI-style vision models
  return JSON.stringify([
    {
      role: 'user',
      content: messageContent
    }
  ]);
};
