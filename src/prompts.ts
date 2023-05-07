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
