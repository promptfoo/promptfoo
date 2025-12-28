/**
 * AssertionConfigForm
 *
 * Renders type-specific configuration fields for assertions based on the registry.
 * Dynamically generates forms with appropriate input types for each field.
 */

import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Textarea } from '@app/components/ui/textarea';
import type { Assertion } from '@promptfoo/types';
import {
  getAssertionType,
  type AssertionFieldDefinition,
} from '@app/utils/assertionRegistry';

interface AssertionConfigFormProps {
  assertion: Assertion;
  onChange: (assertion: Assertion) => void;
}

/**
 * Renders configuration fields for an assertion based on its type definition
 */
export function AssertionConfigForm({ assertion, onChange }: AssertionConfigFormProps) {
  const typeDef = getAssertionType(assertion.type);

  // If no type definition found or no fields, show generic textarea
  if (!typeDef || typeDef.fields.length === 0) {
    return (
      <GenericValueField
        value={getValueString(assertion.value)}
        onChange={(value) => onChange({ ...assertion, value })}
      />
    );
  }

  return (
    <div className="space-y-4">
      {typeDef.fields.map((field) => (
        <FieldRenderer
          key={field.name}
          field={field}
          value={getFieldValue(assertion, field.name)}
          onChange={(value) => {
            const updated = { ...assertion, [field.name]: value };
            onChange(updated);
          }}
        />
      ))}
    </div>
  );
}

/**
 * Renders a field based on its type definition
 */
function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: AssertionFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `assertion-field-${field.name}`;

  switch (field.type) {
    case 'text':
      return (
        <TextFieldRenderer
          id={id}
          field={field}
          value={String(value ?? '')}
          onChange={onChange}
        />
      );

    case 'textarea':
      return (
        <TextareaFieldRenderer
          id={id}
          field={field}
          value={String(value ?? '')}
          onChange={onChange}
        />
      );

    case 'number':
      return (
        <NumberFieldRenderer
          id={id}
          field={field}
          value={value as number | undefined}
          onChange={onChange}
        />
      );

    case 'select':
      return (
        <SelectFieldRenderer
          id={id}
          field={field}
          value={String(value ?? '')}
          onChange={onChange}
        />
      );

    case 'code':
      return (
        <CodeFieldRenderer
          id={id}
          field={field}
          value={String(value ?? '')}
          onChange={onChange}
        />
      );

    case 'array':
      return (
        <ArrayFieldRenderer
          id={id}
          field={field}
          value={value as string[] | string | undefined}
          onChange={onChange}
        />
      );

    case 'provider':
      return (
        <ProviderFieldRenderer
          id={id}
          field={field}
          value={String(value ?? '')}
          onChange={onChange}
        />
      );

    default:
      return (
        <TextFieldRenderer
          id={id}
          field={field}
          value={String(value ?? '')}
          onChange={onChange}
        />
      );
  }
}

/**
 * Text input field
 */
function TextFieldRenderer({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: AssertionFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel id={id} field={field} />
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="font-mono text-sm"
      />
      {field.helpText && <FieldHelp text={field.helpText} />}
    </div>
  );
}

/**
 * Textarea field
 */
function TextareaFieldRenderer({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: AssertionFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel id={id} field={field} />
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="min-h-[80px] resize-y"
      />
      {field.helpText && <FieldHelp text={field.helpText} />}
    </div>
  );
}

/**
 * Number input field
 */
function NumberFieldRenderer({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: AssertionFieldDefinition;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel id={id} field={field} />
      <Input
        id={id}
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const numVal = e.target.value === '' ? undefined : Number(e.target.value);
          onChange(numVal);
        }}
        placeholder={field.placeholder}
        min={field.validation?.min}
        max={field.validation?.max}
        step={field.validation?.max && field.validation.max <= 1 ? 0.1 : 1}
        className="w-32"
      />
      {field.helpText && <FieldHelp text={field.helpText} />}
    </div>
  );
}

/**
 * Select dropdown field
 */
function SelectFieldRenderer({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: AssertionFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel id={id} field={field} />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-48">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field.helpText && <FieldHelp text={field.helpText} />}
    </div>
  );
}

/**
 * Code input field (monospace textarea)
 */
function CodeFieldRenderer({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: AssertionFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel id={id} field={field} />
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="min-h-[100px] resize-y font-mono text-sm"
      />
      {field.helpText && <FieldHelp text={field.helpText} />}
    </div>
  );
}

/**
 * Array input field (newline-separated values)
 */
function ArrayFieldRenderer({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: AssertionFieldDefinition;
  value: string[] | string | undefined;
  onChange: (value: string[]) => void;
}) {
  // Convert value to string for textarea
  const stringValue = Array.isArray(value) ? value.join('\n') : (value ?? '');

  return (
    <div className="space-y-2">
      <FieldLabel id={id} field={field} />
      <Textarea
        id={id}
        value={stringValue}
        onChange={(e) => {
          // Split by newlines and filter empty strings
          const values = e.target.value
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(values);
        }}
        placeholder={field.placeholder}
        className="min-h-[80px] resize-y"
      />
      <p className="text-xs text-muted-foreground">
        Enter one value per line
      </p>
      {field.helpText && <FieldHelp text={field.helpText} />}
    </div>
  );
}

/**
 * Provider selector field
 */
function ProviderFieldRenderer({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: AssertionFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  // Common provider options
  const providers = [
    { value: '', label: 'Default (use config default)' },
    { value: 'openai:gpt-4o', label: 'GPT-4o' },
    { value: 'openai:gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'anthropic:claude-sonnet-4-20250514', label: 'Claude 4 Sonnet' },
    { value: 'anthropic:claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
  ];

  return (
    <div className="space-y-2">
      <FieldLabel id={id} field={field} />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Use default provider" />
        </SelectTrigger>
        <SelectContent>
          {providers.map((provider) => (
            <SelectItem key={provider.value} value={provider.value || 'default'}>
              {provider.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder="Or enter custom provider..."
        value={value && !providers.some((p) => p.value === value) ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2"
      />
      {field.helpText && <FieldHelp text={field.helpText} />}
    </div>
  );
}

/**
 * Generic value field (fallback for unknown types)
 */
function GenericValueField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="assertion-value" className="text-sm font-medium">
        Value
      </Label>
      <Textarea
        id="assertion-value"
        placeholder="Enter expected value or criteria..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[80px] resize-y"
      />
    </div>
  );
}

/**
 * Field label component
 */
function FieldLabel({
  id,
  field,
}: {
  id: string;
  field: AssertionFieldDefinition;
}) {
  return (
    <Label htmlFor={id} className="text-sm font-medium">
      {field.label}
      {field.required && <span className="text-destructive ml-1">*</span>}
    </Label>
  );
}

/**
 * Field help text component
 */
function FieldHelp({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>;
}

/**
 * Helper to get field value from assertion
 */
function getFieldValue(assertion: Assertion, fieldName: string): unknown {
  if (fieldName === 'value') {
    return assertion.value;
  }
  if (fieldName === 'threshold') {
    return assertion.threshold;
  }
  if (fieldName === 'provider') {
    return assertion.provider;
  }
  // Check for additional fields in the assertion object
  return (assertion as Record<string, unknown>)[fieldName];
}

/**
 * Helper to convert value to string
 */
function getValueString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.join('\n');
  }
  return JSON.stringify(value);
}

export default AssertionConfigForm;
