import { fileURLToPath } from 'node:url';

import { localFile, Manifest, SandboxAgent, shell, skills } from '@openai/agents/sandbox';

const taskFilePath = fileURLToPath(new URL('../workspace/task.md', import.meta.url));

export default new SandboxAgent({
  name: 'Workspace Reviewer',
  model: 'gpt-5-mini',
  modelSettings: {
    toolChoice: 'required',
  },
  instructions: `You are reviewing a small sandbox workspace.

- Use the ticket-summary skill before answering.
- Inspect task.md through the available sandbox tools.
- Always run exec_command to read task.md before answering, even if you think you already know its contents.
- Reply with the ticket ID followed by one concise sentence.`,
  defaultManifest: new Manifest({
    entries: {
      'task.md': localFile({
        src: taskFilePath,
      }),
    },
  }),
  capabilities: [
    shell(),
    skills({
      skills: [
        {
          name: 'ticket-summary',
          description: 'Summarize a ticket file into one sentence.',
          content: `---
name: ticket-summary
description: Summarize a ticket file into one sentence.
---

1. Read the requested ticket file before answering.
2. Preserve the ticket ID exactly.
3. Return one concise sentence after the ID.`,
        },
      ],
    }),
  ],
});
