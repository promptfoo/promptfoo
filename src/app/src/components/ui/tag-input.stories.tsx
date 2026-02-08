import { useState } from 'react';

import { TagInput } from './tag-input';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof TagInput> = {
  title: 'UI/TagInput',
  component: TagInput,
  tags: ['autodocs'],
  argTypes: {
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the input is disabled',
    },
  },
};

export default meta;
type Story = StoryObj<typeof TagInput>;

// Default tag input
export const Default: Story = {
  render: function DefaultTagInput() {
    const [tags, setTags] = useState<string[]>([]);
    return (
      <div className="w-[400px]">
        <TagInput value={tags} onChange={setTags} placeholder="Add tags..." aria-label="Tags" />
      </div>
    );
  },
};

// With initial values
export const WithInitialValues: Story = {
  render: function WithValuesTagInput() {
    const [tags, setTags] = useState<string[]>(['security', 'api', 'performance']);
    return (
      <div className="w-[400px]">
        <TagInput
          value={tags}
          onChange={setTags}
          placeholder="Add more tags..."
          aria-label="Tags"
        />
      </div>
    );
  },
};

// With suggestions
export const WithSuggestions: Story = {
  render: function SuggestionsTagInput() {
    const [tags, setTags] = useState<string[]>(['security']);
    const suggestions = [
      'security',
      'performance',
      'api',
      'authentication',
      'authorization',
      'injection',
      'xss',
      'csrf',
      'rate-limiting',
      'encryption',
    ];

    return (
      <div className="w-[400px]">
        <TagInput
          value={tags}
          onChange={setTags}
          suggestions={suggestions}
          placeholder="Type to see suggestions..."
          aria-label="Security tags"
        />
      </div>
    );
  },
};

// Plugin selection example
export const PluginSelection: Story = {
  render: function PluginSelectionTagInput() {
    const [plugins, setPlugins] = useState<string[]>(['harmful:hate', 'harmful:violent-crime']);
    const availablePlugins = [
      'harmful:hate',
      'harmful:violent-crime',
      'harmful:self-harm',
      'harmful:sexual-content',
      'harmful:privacy',
      'harmful:intellectual-property',
      'pii:direct',
      'pii:indirect',
      'contracts',
      'politics',
      'hallucination',
    ];

    return (
      <div className="w-[500px] space-y-2">
        <label className="text-sm font-medium">Red Team Plugins</label>
        <TagInput
          value={plugins}
          onChange={setPlugins}
          suggestions={availablePlugins}
          placeholder="Add plugins..."
          aria-label="Red team plugins"
        />
        <p className="text-sm text-muted-foreground">
          {plugins.length} plugin{plugins.length !== 1 ? 's' : ''} selected
        </p>
      </div>
    );
  },
};

// Disabled
export const Disabled: Story = {
  render: function DisabledTagInput() {
    const [tags, setTags] = useState<string[]>(['locked', 'tag']);
    return (
      <div className="w-[400px]">
        <TagInput value={tags} onChange={setTags} disabled aria-label="Disabled tags" />
      </div>
    );
  },
};

// With normalize function
export const WithNormalize: Story = {
  render: function NormalizeTagInput() {
    const [tags, setTags] = useState<string[]>(['lowercase', 'tags']);

    // Normalize to lowercase and remove special characters
    const normalizeValue = (input: string) => {
      const normalized = input.toLowerCase().replace(/[^a-z0-9-]/g, '');
      return normalized || null;
    };

    return (
      <div className="w-[400px] space-y-2">
        <label className="text-sm font-medium">Tags (lowercase only)</label>
        <TagInput
          value={tags}
          onChange={setTags}
          normalizeValue={normalizeValue}
          placeholder="Type tags (auto-lowercased)..."
          aria-label="Normalized tags"
        />
      </div>
    );
  },
};

// Email addresses
export const EmailAddresses: Story = {
  render: function EmailTagInput() {
    const [emails, setEmails] = useState<string[]>(['user@example.com']);

    return (
      <div className="w-[450px] space-y-2">
        <label className="text-sm font-medium">Recipients</label>
        <TagInput
          value={emails}
          onChange={setEmails}
          placeholder="Add email addresses..."
          aria-label="Email recipients"
        />
      </div>
    );
  },
};

// Many tags
export const ManyTags: Story = {
  render: function ManyTagsInput() {
    const [tags, setTags] = useState<string[]>([
      'tag-1',
      'tag-2',
      'tag-3',
      'tag-4',
      'tag-5',
      'tag-6',
      'tag-7',
      'tag-8',
      'tag-9',
      'tag-10',
    ]);

    return (
      <div className="w-[400px]">
        <TagInput
          value={tags}
          onChange={setTags}
          placeholder="Add more..."
          aria-label="Many tags"
        />
      </div>
    );
  },
};

// In form context
export const InForm: Story = {
  render: function FormTagInput() {
    const [labels, setLabels] = useState<string[]>([]);
    const [categories, setCategories] = useState<string[]>([]);

    const categoryOptions = ['Bug', 'Feature', 'Enhancement', 'Documentation', 'Question'];

    return (
      <div className="w-[400px] space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Labels</label>
          <TagInput
            value={labels}
            onChange={setLabels}
            placeholder="Add custom labels..."
            aria-label="Labels"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Categories</label>
          <TagInput
            value={categories}
            onChange={setCategories}
            suggestions={categoryOptions}
            placeholder="Select categories..."
            aria-label="Categories"
          />
        </div>
        <button
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
          onClick={() => {
            console.log({ labels, categories });
          }}
        >
          Submit
        </button>
      </div>
    );
  },
};
