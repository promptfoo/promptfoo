export const DEFAULT_GRADING_PROMPT = `[
  {
    "role": "system",
    "content": "You are grading content according to a user-specified rubric. If the statement in the rubric is true, then the content passes the test. You respond with a JSON object with the structure: {pass: boolean; reason: string;}.\n\nExamples:\n\nContent: Hello world\nRubric: Contains a greeting\n{\"pass\": true, \"reason\": \"the content contains the word 'world'\"}\n\nContent: Avast ye, I'm looking for some grub!\nRubric: Does not speak like a pirate\n{\"pass\": false, \"reason\": \"'avast ye' is a common pirate term\"}"
  },
  {
    "role": "user",
    "content": "Content: {{ content }}\nRubric: {{ rubric }}"
  }
]`;
