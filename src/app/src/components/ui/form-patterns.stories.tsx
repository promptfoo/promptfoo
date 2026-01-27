import { useState } from 'react';

import { Button } from './button';
import { Checkbox } from './checkbox';
import { HelperText } from './helper-text';
import { Input } from './input';
import { Label } from './label';
import { Textarea } from './textarea';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
  title: 'UI/Form Patterns',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Examples demonstrating the standardized Label and HelperText components across various form patterns.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

/**
 * Demonstrates the standard pattern for a text input with label and helper text.
 * The Label component includes default bottom margin (mb-2) for consistent spacing.
 */
export const BasicInput: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="username">Username</Label>
      <Input type="text" id="username" placeholder="johndoe" />
      <HelperText>This will be your public display name.</HelperText>
    </div>
  ),
};

/**
 * Shows a required field with the standard asterisk indicator pattern.
 */
export const RequiredField: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="email">
        Email <span className="text-destructive">*</span>
      </Label>
      <Input type="email" id="email" placeholder="email@example.com" required />
      <HelperText>We'll never share your email with anyone.</HelperText>
    </div>
  ),
};

/**
 * Demonstrates error state styling using HelperText with the error prop.
 * Note how the error styling is applied consistently.
 */
export const ErrorState: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="email-error" className="text-destructive">
        Email <span>*</span>
      </Label>
      <Input
        type="email"
        id="email-error"
        placeholder="email@example.com"
        className="border-destructive focus-visible:ring-destructive"
      />
      <HelperText error>Please enter a valid email address.</HelperText>
    </div>
  ),
};

/**
 * Shows the inline Label variant used for checkboxes and radio buttons.
 * The inline prop removes the default bottom margin for proper alignment.
 */
export const CheckboxWithInlineLabel: Story = {
  render: () => (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox id="terms" />
        <Label htmlFor="terms" inline>
          I accept the terms and conditions
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="newsletter" />
        <Label htmlFor="newsletter" inline>
          Subscribe to newsletter
        </Label>
      </div>
    </div>
  ),
};

/**
 * Demonstrates a textarea with label and helper text.
 */
export const TextareaPattern: Story = {
  render: () => (
    <div className="flex flex-col w-full max-w-sm">
      <Label htmlFor="description">Description</Label>
      <Textarea id="description" placeholder="Tell us more..." rows={4} />
      <HelperText>Provide a detailed description of your request.</HelperText>
    </div>
  ),
};

/**
 * Interactive example showing validation on form submission.
 * This demonstrates the full lifecycle: normal → error → success.
 */
export const InteractiveValidation: Story = {
  render: function ValidationExample() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitted(false);
      setError('');

      if (!email) {
        setError('Email is required.');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Please enter a valid email address.');
        return;
      }

      setSubmitted(true);
    };

    return (
      <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
        <div className="flex flex-col">
          <Label htmlFor="email-interactive" className={error ? 'text-destructive' : ''}>
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            type="email"
            id="email-interactive"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
              setSubmitted(false);
            }}
            placeholder="email@example.com"
            className={error ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
          {error && <HelperText error>{error}</HelperText>}
          {!error && !submitted && <HelperText>Enter your email address.</HelperText>}
          {submitted && <HelperText className="text-green-600">Email is valid! ✓</HelperText>}
        </div>
        <Button type="submit">Validate</Button>
      </form>
    );
  },
};

/**
 * Comprehensive form example showing all patterns together:
 * - Required fields with asterisks
 * - Helper text for guidance
 * - Error states
 * - Inline labels for checkboxes
 * - Textareas
 */
export const CompleteForm: Story = {
  render: () => (
    <div className="space-y-6 w-full max-w-md">
      <div className="flex flex-col">
        <Label htmlFor="fullname">
          Full Name <span className="text-destructive">*</span>
        </Label>
        <Input type="text" id="fullname" placeholder="John Doe" required />
        <HelperText>Enter your first and last name.</HelperText>
      </div>

      <div className="flex flex-col">
        <Label htmlFor="email-complete">
          Email <span className="text-destructive">*</span>
        </Label>
        <Input type="email" id="email-complete" placeholder="email@example.com" required />
        <HelperText>We'll send a verification link to this address.</HelperText>
      </div>

      <div className="flex flex-col">
        <Label htmlFor="password-complete" className="text-destructive">
          Password <span>*</span>
        </Label>
        <Input
          type="password"
          id="password-complete"
          placeholder="Enter password"
          className="border-destructive focus-visible:ring-destructive"
        />
        <HelperText error>Password must be at least 8 characters long.</HelperText>
      </div>

      <div className="flex flex-col">
        <Label htmlFor="bio">
          Bio <span className="text-xs font-normal text-muted-foreground ml-1">optional</span>
        </Label>
        <Textarea id="bio" placeholder="Tell us about yourself..." rows={4} />
        <HelperText>This will be displayed on your public profile.</HelperText>
      </div>

      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Checkbox id="terms-complete" />
          <Label htmlFor="terms-complete" inline>
            I accept the terms and conditions <span className="text-destructive">*</span>
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="marketing" />
          <Label htmlFor="marketing" inline>
            Send me marketing emails
          </Label>
        </div>
      </div>

      <Button type="submit" className="w-full">
        Submit
      </Button>
    </div>
  ),
};

/**
 * Shows the layout pattern used in the PR: flex flex-col for form fields.
 * This replaced the previous grid-based layout for more predictable spacing.
 */
export const LayoutComparison: Story = {
  render: () => (
    <div className="space-y-8 w-full max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold mb-4">
          New Pattern: flex flex-col (consistent with Label mb-2)
        </h3>
        <div className="flex flex-col w-full max-w-sm">
          <Label htmlFor="new-pattern">Email</Label>
          <Input type="email" id="new-pattern" placeholder="email@example.com" />
          <HelperText>Helper text with proper spacing.</HelperText>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-4">Multiple fields with consistent spacing</h3>
        <div className="space-y-4 w-full max-w-sm">
          <div className="flex flex-col">
            <Label htmlFor="field1">Field 1</Label>
            <Input id="field1" placeholder="Value 1" />
            <HelperText>Helper text for field 1.</HelperText>
          </div>
          <div className="flex flex-col">
            <Label htmlFor="field2">Field 2</Label>
            <Input id="field2" placeholder="Value 2" />
            <HelperText>Helper text for field 2.</HelperText>
          </div>
          <div className="flex flex-col">
            <Label htmlFor="field3">Field 3</Label>
            <Input id="field3" placeholder="Value 3" />
            <HelperText>Helper text for field 3.</HelperText>
          </div>
        </div>
      </div>
    </div>
  ),
};
