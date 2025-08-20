/**
 * OpenAI Vision LLM-Rubric Template
 * Returns a template string that will be rendered with Nunjucks
 */
module.exports = function openaiVisionRubricTemplate() {
  // Return a template string with Nunjucks variables
  // The vars.image will be automatically included by the core matchers.ts code
  return `[
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "You are evaluating an AI model's output based on a specific rubric.\\n\\nOutput to evaluate:\\n{{output}}\\n\\nEvaluation Rubric:\\n{{rubric}}\\n\\nPlease evaluate the output against the rubric. The image provided in vars.image should be considered in your evaluation.\\n\\nRespond with a JSON object:\\n{\\\"pass\\\": <boolean>, \\\"score\\\": <number between 0 and 1>, \\\"reason\\\": \\\"<detailed explanation>\\\"}"
        }
      ]
    }
  ]`;
};
