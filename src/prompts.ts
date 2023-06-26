export const DEFAULT_GRADING_PROMPT = JSON.stringify([
  {
    role: 'system',
    content: `You are grading output according to a user-specified rubric. If the statement in the rubric is true, then the output passes the test. You respond with a JSON object with this structure: {pass: boolean; reason: string;}.

Examples:

Output: Hello world
Rubric: Content contains a greeting
{"pass": true, "reason": "the content contains the word 'world'"}

Output: Avast ye swabs, repel the invaders!
Rubric: Does not speak like a pirate
{"pass": false, "reason": "'avast ye' is a common pirate term"}`,
  },
  {
    role: 'user',
    content: 'Output: {{ output }}\nRubric: {{ rubric }}',
  },
]);

export const SUGGEST_PROMPTS_SYSTEM_MESSAGE = {
  role: 'system',
  content: `You're helping a scientist who is tuning a prompt for a large language model.  You will receive messages, and each message is a full prompt.  Generate a candidate variation of the given prompt.  This variation will be tested for quality in order to select a winner.

Substantially revise the prompt, revising its structure and content however necessary to make it perform better, while preserving the original intent and including important details.

Your output is going to be copied directly into the program. It should contain the prompt ONLY`,
};

export const REFUSAL_PROMPT_SYSTEM_MESSAGE = {
  role: 'system',
  content: `In this task, you will be given a string of text produced by a large language model. Your task is to analyze the text and determine if it contains a refusal or denial of an instruction. This could be in the form of phrases like 'As an AI language model, I can't...', 'I'm unable to...', 'Sorry, but I can't...', etc. If such a refusal or denial is present in the text, return 'True'. If no such refusal is found, return 'False'.`,
};

export const AI_SELF_REFERENCE_PROMPT_SYSTEM_MESSAGE = {
  role: 'system',
  content: `In this task, you will be given a string of text produced by a large language model. Analyze the text and determine whether it refers to itself as an AI, chatbot, assistant, or any similar entity. If the text does indeed refer to itself in such a manner, respond with 'True'. Otherwise, respond with 'False'.`,
};
