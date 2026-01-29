import { useState } from 'react';

import { HelperText } from './helper-text';
import { Label } from './label';
import { Textarea } from './textarea';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof Textarea> = {
  title: 'UI/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  argTypes: {
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the textarea is disabled',
    },
    rows: {
      control: 'number',
      description: 'Number of visible text lines',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

// Default textarea
export const Default: Story = {
  args: {
    placeholder: 'Type your message here...',
  },
};

// With label
export const WithLabel: Story = {
  render: () => (
    <div className="flex flex-col w-full">
      <Label htmlFor="message">Your message</Label>
      <Textarea placeholder="Type your message here." id="message" />
    </div>
  ),
};

// With helper text
export const WithHelperText: Story = {
  render: () => (
    <div className="flex flex-col w-full">
      <Label htmlFor="bio">Bio</Label>
      <Textarea placeholder="Tell us about yourself" id="bio" />
      <HelperText>You can @mention other users and organizations.</HelperText>
    </div>
  ),
};

// Disabled state
export const Disabled: Story = {
  args: {
    placeholder: 'This textarea is disabled',
    disabled: true,
  },
};

// With default value
export const WithValue: Story = {
  args: {
    defaultValue:
      'This is a pre-filled textarea with some content. You can edit this text or replace it entirely.',
  },
};

// Different sizes via rows
export const DifferentRows: Story = {
  render: () => (
    <div className="space-y-4 w-full max-w-md">
      <div className="flex flex-col">
        <Label>Small (3 rows)</Label>
        <Textarea placeholder="Small textarea" rows={3} />
      </div>
      <div className="flex flex-col">
        <Label>Medium (5 rows)</Label>
        <Textarea placeholder="Medium textarea" rows={5} />
      </div>
      <div className="flex flex-col">
        <Label>Large (8 rows)</Label>
        <Textarea placeholder="Large textarea" rows={8} />
      </div>
    </div>
  ),
};

// Read-only
export const ReadOnly: Story = {
  args: {
    defaultValue: 'This is read-only content that cannot be edited.',
    readOnly: true,
  },
};

// With character count
export const WithCharacterCount: Story = {
  render: function CharacterCountTextarea() {
    const maxLength = 280;
    const [value, setValue] = useState('');

    return (
      <div className="flex flex-col w-full">
        <Label htmlFor="tweet">Tweet</Label>
        <Textarea
          id="tweet"
          placeholder="What's happening?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={maxLength}
        />
        <HelperText error={value.length > maxLength * 0.9} className="text-right">
          {value.length}/{maxLength}
        </HelperText>
      </div>
    );
  },
};

// Form example
export const FormExample: Story = {
  render: () => (
    <div className="space-y-4 w-full max-w-md">
      <div className="flex flex-col">
        <Label htmlFor="subject">Subject</Label>
        <input
          id="subject"
          className="flex h-10 w-full rounded-md border border-input bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
          placeholder="Enter subject"
        />
      </div>
      <div className="flex flex-col">
        <Label htmlFor="body">Message</Label>
        <Textarea id="body" placeholder="Enter your message" rows={6} />
      </div>
      <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
        Send Message
      </button>
    </div>
  ),
};
