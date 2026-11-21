import { readFile } from 'node:fs/promises';

export default [
  {
    name: 'read_receipt',
    description: 'Read the synthetic receipt in the workspace.',
    parameters: {
      type: 'object',
      properties: { filename: { type: 'string', enum: ['receipt.txt'] } },
      required: ['filename'],
      additionalProperties: false,
    },
    execute: () => readFile(new URL('./workspace/receipt.txt', import.meta.url), 'utf8'),
  },
];
