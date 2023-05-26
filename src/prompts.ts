export const DEFAULT_GRADING_PROMPT = JSON.stringify([
  {
    role: 'system',
    content: `You are grading content according to a user-specified rubric. If the statement in the rubric is true, then the content passes the test. You respond with a JSON object with this structure: {pass: boolean; reason: string;}.

Examples:

Content: Hello world
Rubric: Contains a greeting
{"pass": true, "reason": "the content contains the word 'world'"}

Content: Avast ye swabs, repel the invaders!
Rubric: Does not speak like a pirate
{"pass": false, "reason": "'avast ye' is a common pirate term"}`,
  },
  {
    role: 'user',
    content: 'Content: {{ content }}\nRubric: {{ rubric }}',
  },
]);

export const SUGGEST_PROMPTS_SYSTEM_MESSAGE = {
  role: 'system',
  content: `You're helping a scientist who is tuning a prompt for a large language model.  You will receive messages, and each message is a full prompt.  Generate a candidate variation of the given prompt.  This variation will be tested for quality in order to select a winner.

Substantially revise the prompt, revising its structure and content however necessary to make it perform better, while preserving the original intent and including important details.

Your output is going to be copied directly into the program. It should contain the prompt ONLY`,
};
