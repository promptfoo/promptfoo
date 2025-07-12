#!/usr/bin/env node

const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Try to load API key from .env file one directory up
let OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  const envPath = path.join(__dirname, '../../.env');
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/OPENAI_API_KEY=(.+)/);
    if (match) {
      OPENAI_API_KEY = match[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch (e) {
    // .env file doesn't exist or can't be read
  }
}

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY not found in environment or .env file');
  console.error('Set it with: export OPENAI_API_KEY="your-key" or add to ../.env');
  process.exit(1);
}

// Get git diff
let diff;
try {
  // Get staged changes first, fall back to all changes if none staged
  diff = execSync('git diff --cached', { encoding: 'utf8' });
  if (!diff.trim()) {
    diff = execSync('git diff', { encoding: 'utf8' });
  }

  if (!diff.trim()) {
    console.error('No changes detected. Stage changes with `git add` or make changes first.');
    process.exit(1);
  }
} catch (error) {
  console.error('Error getting git diff:', error.message);
  process.exit(1);
}

// Limit diff size to avoid token limits (o4-mini has 200k context window)
const MAX_DIFF_LENGTH = 150000; // Conservative limit
if (diff.length > MAX_DIFF_LENGTH) {
  diff = diff.substring(0, MAX_DIFF_LENGTH) + '\n... (diff truncated)';
}

// Define the structured output schema
const responseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'conventional_commit',
    schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [
            'feat',
            'fix',
            'docs',
            'style',
            'refactor',
            'perf',
            'test',
            'build',
            'ci',
            'chore',
            'revert',
          ],
        },
        scope: {
          type: 'string',
          description: 'Optional scope of the change',
        },
        description: {
          type: 'string',
          description: 'Short description in present tense, max 50 chars',
        },
        breaking: {
          type: 'boolean',
          description: 'Whether this is a breaking change',
        },
      },
      required: ['type', 'description'],
      additionalProperties: false,
    },
    strict: true,
  },
};

const prompt = `Analyze the following git diff and generate a conventional commit message.

Rules:
- Choose the most appropriate type based on the changes
- Include scope if it helps clarify the change (e.g., component name, module)
- Description should be concise, in present tense, and under 50 characters
- Set breaking to true only for breaking changes

Git diff:
${diff}`;

const postData = JSON.stringify({
  model: 'o4-mini',
  messages: [
    {
      role: 'system',
      content:
        'You are a git commit message generator. Analyze diffs and generate structured conventional commits.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ],
  response_format: responseFormat,
  temperature: 0.3,
  max_tokens: 200,
});

const options = {
  hostname: 'api.openai.com',
  port: 443,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    'Content-Length': Buffer.byteLength(postData),
  },
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.error) {
        console.error('OpenAI API error:', response.error.message);
        process.exit(1);
      }

      const commit = JSON.parse(response.choices[0].message.content);

      // Format the commit message
      let message = commit.type;
      if (commit.scope) {
        message += `(${commit.scope})`;
      }
      message += `: ${commit.description}`;
      if (commit.breaking) {
        message = message.replace(':', '!:');
      }

      console.log(message);

      // Optional: copy to clipboard if pbcopy is available (macOS)
      if (process.platform === 'darwin') {
        try {
          execSync('pbcopy', { input: message });
          console.log('\n✓ Copied to clipboard');
        } catch (e) {
          // Ignore clipboard errors
        }
      }
    } catch (error) {
      console.error('Error parsing response:', error.message);
      console.error('Raw response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error.message);
  process.exit(1);
});

req.write(postData);
req.end();
