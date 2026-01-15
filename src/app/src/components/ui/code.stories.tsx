import { Code } from './code';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Code> = {
  title: 'UI/Code',
  component: Code,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Code>;

// Default code block
export const Default: Story = {
  args: {
    children: 'const message = "Hello, World!";',
  },
};

// Multi-line code
export const MultiLine: Story = {
  render: () => (
    <Code>
      {`function greet(name: string) {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));`}
    </Code>
  ),
};

// JSON example
export const JSONExample: Story = {
  render: () => (
    <Code>
      {`{
  "name": "promptfoo",
  "version": "1.0.0",
  "description": "LLM evaluation framework",
  "providers": ["openai:gpt-4", "anthropic:claude-3"]
}`}
    </Code>
  ),
};

// YAML configuration
export const YAMLConfig: Story = {
  render: () => (
    <Code>
      {`prompts:
  - "Write a poem about {{topic}}"
  - "Explain {{concept}} in simple terms"

providers:
  - openai:gpt-4
  - anthropic:claude-3-opus

tests:
  - vars:
      topic: "nature"
      concept: "quantum physics"`}
    </Code>
  ),
};

// Shell command
export const ShellCommand: Story = {
  render: () => <Code>npx promptfoo eval -c promptfooconfig.yaml</Code>,
};

// API response
export const APIResponse: Story = {
  render: () => (
    <Code>
      {`{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1703654432,
  "model": "gpt-4-0613",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 15,
    "total_tokens": 25
  }
}`}
    </Code>
  ),
};

// With custom styling
export const CustomStyling: Story = {
  render: () => (
    <div className="space-y-4">
      <Code className="text-xs">Small code text</Code>
      <Code className="text-lg">Large code text</Code>
      <Code className="bg-blue-100 dark:bg-blue-950">Custom background</Code>
    </div>
  ),
};

// In context
export const InContext: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Installation</h3>
      <p className="text-sm text-muted-foreground">Install promptfoo using npm:</p>
      <Code>npm install -g promptfoo</Code>
      <p className="text-sm text-muted-foreground">Or using npx:</p>
      <Code>npx promptfoo init</Code>
    </div>
  ),
};
