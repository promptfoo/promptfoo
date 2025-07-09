import * as fs from 'fs';
import { processPromptyFile } from '../../../src/prompts/processors/prompty';
import type { Prompt } from '../../../src/types';

jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('processPromptyFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a basic chat prompty file', async () => {
    const promptyContent = `---
name: Basic Chat Prompt
description: A simple chat prompt
model:
  api: chat
---
system:
You are a helpful assistant.

user:
{{question}}`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {});

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Basic Chat Prompt');
    
    const messages = JSON.parse(result[0].raw);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.'
    });
    expect(messages[1]).toEqual({
      role: 'user',
      content: '{{question}}'
    });
  });

  it('should process a completion prompty file', async () => {
    const promptyContent = `---
name: Completion Prompt
model:
  api: completion
---
Complete the following: {{text}}`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {});

    expect(result).toHaveLength(1);
    expect(result[0].raw).toBe('Complete the following: {{text}}');
  });

  it('should handle role markers without hash', async () => {
    const promptyContent = `---
name: Test
---
system:
System message

user:
User message`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {});
    const messages = JSON.parse(result[0].raw);
    
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('should handle content without initial role (defaults to system)', async () => {
    const promptyContent = `---
name: Test
---
This is the system message.

user:
This is the user message.`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {});
    const messages = JSON.parse(result[0].raw);
    
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'This is the system message.'
    });
  });

  it('should handle images in chat content', async () => {
    const promptyContent = `---
name: Image Chat
---
user:
Look at this image: ![Alt text](image.png)
What do you see?`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {});
    const messages = JSON.parse(result[0].raw);
    
    expect(messages[0].content).toBeInstanceOf(Array);
    expect(messages[0].content).toHaveLength(3);
    expect(messages[0].content[0]).toEqual({
      type: 'text',
      text: 'Look at this image:'
    });
    expect(messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'image.png' }
    });
    expect(messages[0].content[2]).toEqual({
      type: 'text',
      text: 'What do you see?'
    });
  });

  it('should map Azure OpenAI configuration', async () => {
    const promptyContent = `---
name: Azure Test
model:
  api: chat
  configuration:
    type: azure_openai
    api_key: test-key
    api_version: "2023-05-15"
    azure_deployment: gpt-4
    azure_endpoint: https://test.openai.azure.com
  parameters:
    temperature: 0.7
    max_tokens: 1000
---
user:
Hello`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {});
    
    expect(result[0].config).toEqual({
      apiKey: 'test-key',
      apiVersion: '2023-05-15',
      deployment: 'gpt-4',
      endpoint: 'https://test.openai.azure.com',
      temperature: 0.7,
      max_tokens: 1000
    });
  });

  it('should map OpenAI configuration', async () => {
    const promptyContent = `---
name: OpenAI Test
model:
  configuration:
    type: openai
    name: gpt-4
    organization: test-org
  parameters:
    temperature: 0.5
---
user:
Hello`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {});
    
    expect(result[0].config).toEqual({
      model: 'gpt-4',
      organization: 'test-org',
      temperature: 0.5
    });
  });

  it('should handle sample data and create a function', async () => {
    const promptyContent = `---
name: Sample Data Test
sample:
  name: John
  topic: AI
---
user:
Hello {{name}}, let's talk about {{topic}}.`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {});
    
    expect(result[0].function).toBeDefined();
  });

  it('should handle multi-turn conversations', async () => {
    const promptyContent = `---
name: Conversation
---
system:
You are helpful.

user:
What is 2+2?

assistant:
2+2 equals 4.

user:
Thanks!`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {});
    const messages = JSON.parse(result[0].raw);
    
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[2].role).toBe('assistant');
    expect(messages[3].role).toBe('user');
  });

  it('should use custom label if provided', async () => {
    const promptyContent = `---
name: Test Prompt
---
user:
Hello`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', { label: 'Custom Label' });
    
    expect(result[0].label).toBe('Custom Label');
  });

  it('should merge provided config with model config', async () => {
    const promptyContent = `---
name: Config Merge Test
model:
  parameters:
    temperature: 0.7
---
user:
Hello`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {
      config: { max_tokens: 500 }
    });
    
    expect(result[0].config).toEqual({
      temperature: 0.7,
      max_tokens: 500
    });
  });

  it('should handle error when file cannot be read', async () => {
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });

    await expect(processPromptyFile('/path/to/missing.prompty', {}))
      .rejects.toThrow('Failed to process prompty file /path/to/missing.prompty: Error: File not found');
  });

  it('should handle empty content', async () => {
    const promptyContent = `---
name: Empty Content
---
`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {});
    const messages = JSON.parse(result[0].raw);
    
    expect(messages).toHaveLength(0);
  });

  it('should handle function role', async () => {
    const promptyContent = `---
name: Function Test
---
function:
get_weather(location: string)

user:
What's the weather?`;

    mockFs.readFileSync.mockReturnValue(promptyContent);

    const result = await processPromptyFile('/path/to/prompt.prompty', {});
    const messages = JSON.parse(result[0].raw);
    
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('function');
    expect(messages[0].content).toBe('get_weather(location: string)');
  });
}); 