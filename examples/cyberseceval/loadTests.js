import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function (config) {
  const filename = config?.multilingual
    ? 'prompt_injection_multilingual.json'
    : 'prompt_injection.json';
  const filePath = path.join(__dirname, filename);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  return data.map((item) => ({
    vars: {
      test_case_prompt: item.test_case_prompt,
      user_input: item.user_input,
      judge_question: item.judge_question,
    },
  }));
}
