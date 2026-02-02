import { JsonTextarea } from './json-textarea';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof JsonTextarea> = {
  title: 'UI/JsonTextarea',
  component: JsonTextarea,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Label text',
    },
    defaultValue: {
      control: 'text',
      description: 'Default JSON value',
    },
  },
};

export default meta;
type Story = StoryObj<typeof JsonTextarea>;

// Default empty
export const Default: Story = {
  args: {
    label: 'JSON Configuration',
    defaultValue: '',
  },
};

// With valid JSON
export const WithValidJson: Story = {
  args: {
    label: 'Configuration',
    defaultValue: JSON.stringify(
      {
        name: 'test-config',
        enabled: true,
        count: 42,
      },
      null,
      2,
    ),
  },
};

// With array JSON
export const WithArrayJson: Story = {
  args: {
    label: 'Items',
    defaultValue: JSON.stringify(
      [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ],
      null,
      2,
    ),
  },
};

// Provider configuration example
export const ProviderConfig: Story = {
  args: {
    label: 'Provider Configuration',
    defaultValue: JSON.stringify(
      {
        provider: 'openai:gpt-4',
        config: {
          temperature: 0.7,
          max_tokens: 2048,
          top_p: 1,
        },
      },
      null,
      2,
    ),
  },
};

// Test case vars example
export const TestCaseVars: Story = {
  args: {
    label: 'Test Variables',
    defaultValue: JSON.stringify(
      {
        input: 'What is the capital of France?',
        expected: 'Paris',
        context: {
          language: 'en',
          difficulty: 'easy',
        },
      },
      null,
      2,
    ),
  },
};

// Complex nested JSON
export const ComplexNested: Story = {
  args: {
    label: 'Evaluation Config',
    defaultValue: JSON.stringify(
      {
        description: 'GPT-4 Evaluation',
        prompts: ['prompts/base.txt', 'prompts/improved.txt'],
        providers: [
          {
            id: 'openai:gpt-4',
            config: { temperature: 0.7 },
          },
          {
            id: 'openai:gpt-3.5-turbo',
            config: { temperature: 0.5 },
          },
        ],
        tests: [
          {
            vars: { question: 'Hello?' },
            assert: [{ type: 'contains', value: 'Hello' }],
          },
        ],
      },
      null,
      2,
    ),
  },
};

// With onChange callback
export const WithOnChange: Story = {
  render: () => (
    <div className="w-[500px]">
      <JsonTextarea
        label="JSON with Callback"
        defaultValue={JSON.stringify({ key: 'value' }, null, 2)}
        onChange={(parsed) => {
          console.log('Parsed JSON:', parsed);
        }}
      />
      <p className="text-sm text-muted-foreground mt-2">Check console for parsed output</p>
    </div>
  ),
};

// Different widths
export const DifferentWidths: Story = {
  render: () => (
    <div className="space-y-6">
      <div className="w-[300px]">
        <JsonTextarea label="Narrow (300px)" defaultValue='{"small": true}' />
      </div>
      <div className="w-[500px]">
        <JsonTextarea label="Medium (500px)" defaultValue='{"medium": true, "size": "500px"}' />
      </div>
      <div className="w-full max-w-2xl">
        <JsonTextarea
          label="Full Width"
          defaultValue={JSON.stringify({ fullWidth: true, responsive: true }, null, 2)}
        />
      </div>
    </div>
  ),
};

// Invalid JSON demonstration
export const InvalidJsonDemo: Story = {
  render: () => (
    <div className="w-[500px] space-y-4">
      <p className="text-sm text-muted-foreground">
        Try editing the JSON below to see validation. Start with valid JSON, then add an error.
      </p>
      <JsonTextarea
        label="Edit to Test Validation"
        defaultValue={JSON.stringify(
          {
            valid: true,
            tip: 'Remove a quote or comma to see the error state',
          },
          null,
          2,
        )}
      />
    </div>
  ),
};

// API response example
export const ApiResponseExample: Story = {
  args: {
    label: 'API Response Body',
    defaultValue: JSON.stringify(
      {
        success: true,
        data: {
          id: 'eval_123',
          status: 'completed',
          results: {
            passed: 45,
            failed: 5,
            total: 50,
          },
        },
        metadata: {
          timestamp: '2024-01-15T10:30:00Z',
          duration_ms: 1250,
        },
      },
      null,
      2,
    ),
  },
};

// Form integration
export const InForm: Story = {
  render: () => (
    <div className="w-[500px] space-y-6 p-4 border rounded-lg">
      <h3 className="font-medium">Create Test Configuration</h3>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Name</label>
          <input
            type="text"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground"
            placeholder="my-test-config"
          />
        </div>
        <JsonTextarea
          label="Variables"
          defaultValue={JSON.stringify(
            {
              input: 'Your test input here',
              expected: 'Expected output',
            },
            null,
            2,
          )}
        />
        <JsonTextarea
          label="Assertions"
          defaultValue={JSON.stringify(
            [
              { type: 'contains', value: 'expected' },
              { type: 'not-contains', value: 'error' },
            ],
            null,
            2,
          )}
        />
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
          Save Configuration
        </button>
      </div>
    </div>
  ),
};
