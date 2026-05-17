import { useMemo, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import {
  type InputConfig,
  type InputDefinition,
  type Inputs,
  type InputType,
  normalizeInputDefinition,
} from '@promptfoo/types';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';

interface InputsEditorProps {
  inputs?: Inputs;
  onChange: (inputs: Inputs | undefined) => void;
  /** When true, renders without the outer collapsible wrapper */
  compact?: boolean;
  /** When true, disables adding new variables */
  disabled?: boolean;
  /** Tooltip text shown when disabled */
  disabledReason?: string;
}

type Variable = {
  config?: InputConfig;
  name: string;
  description: string;
  type: InputType;
};

const INPUT_TYPE_OPTIONS: Array<{ value: InputType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'DOCX' },
  { value: 'image', label: 'Image' },
];

function toStoredInputDefinition(variable: Variable): InputDefinition {
  if (variable.type === 'text' && !variable.config) {
    return variable.description;
  }

  return {
    ...(variable.config ? { config: variable.config } : {}),
    description: variable.description,
    type: variable.type,
  };
}

export default function InputsEditor({
  inputs,
  onChange,
  compact = false,
  disabled = false,
  disabledReason,
}: InputsEditorProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    return inputs ? Object.keys(inputs).length > 0 : false;
  });
  const variableKeysRef = useRef(new Map<string, string>());
  const nextVariableKeyRef = useRef(0);

  const getVariableKey = (name: string) => {
    let key = variableKeysRef.current.get(name);
    if (!key) {
      key = `input-variable-${nextVariableKeyRef.current}`;
      nextVariableKeyRef.current += 1;
      variableKeysRef.current.set(name, key);
    }
    return key;
  };

  // Derive variables from inputs prop
  const variables = useMemo(() => {
    if (!inputs) {
      return [];
    }
    return Object.entries(inputs).map(([name, definition]) => ({
      name,
      ...normalizeInputDefinition(definition),
    }));
  }, [inputs]);

  // Check for duplicate names
  const duplicateNames = useMemo(() => {
    const nameCount = new Map<string, number>();
    variables.forEach(({ name }) => {
      const trimmed = name.trim();
      if (trimmed) {
        nameCount.set(trimmed, (nameCount.get(trimmed) || 0) + 1);
      }
    });
    return new Set([...nameCount.entries()].filter(([, count]) => count > 1).map(([name]) => name));
  }, [variables]);

  const addVariable = () => {
    const existingNames = variables.map((v) => v.name);
    let counter = 1;
    let newName = 'variable';
    while (existingNames.includes(newName)) {
      newName = `variable${counter}`;
      counter++;
    }

    const newInputs = { ...inputs, [newName]: '' };
    onChange(newInputs);
    setIsExpanded(true);
  };

  const updateVariableName = (oldName: string, newName: string) => {
    if (!inputs) {
      return;
    }
    const existingKey = variableKeysRef.current.get(oldName);
    if (existingKey) {
      variableKeysRef.current.delete(oldName);
      variableKeysRef.current.set(newName, existingKey);
    }
    // Build new object preserving order, replacing the old key with new key
    const newInputs: Inputs = {};
    for (const [key, value] of Object.entries(inputs)) {
      if (key === oldName) {
        newInputs[newName] = value;
      } else {
        newInputs[key] = value;
      }
    }
    onChange(newInputs);
  };

  const updateVariableDescription = (name: string, description: string) => {
    if (!inputs) {
      return;
    }
    const currentInput = inputs[name];
    const normalizedInput = currentInput ? normalizeInputDefinition(currentInput) : undefined;
    onChange({
      ...inputs,
      [name]: toStoredInputDefinition({
        config: normalizedInput?.config,
        name,
        description,
        type: normalizedInput?.type ?? 'text',
      }),
    });
  };

  const updateVariableType = (name: string, type: InputType) => {
    if (!inputs) {
      return;
    }
    const currentInput = inputs[name];
    const normalizedInput = currentInput ? normalizeInputDefinition(currentInput) : undefined;
    onChange({
      ...inputs,
      [name]: toStoredInputDefinition({
        config: normalizedInput?.config,
        name,
        description: normalizedInput?.description ?? '',
        type,
      }),
    });
  };

  const removeVariable = (name: string) => {
    if (!inputs) {
      return;
    }
    variableKeysRef.current.delete(name);
    const { [name]: _, ...rest } = inputs;
    onChange(Object.keys(rest).length > 0 ? rest : undefined);
  };

  const addVariableButton = disabled ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block w-fit">
          <Button variant="outline" size="sm" disabled className="pointer-events-none">
            <Plus className="mr-2 size-4" />
            Add Variable
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{disabledReason}</TooltipContent>
    </Tooltip>
  ) : (
    <Button variant="outline" size="sm" onClick={addVariable}>
      <Plus className="mr-2 size-4" />
      Add Variable
    </Button>
  );

  const variablesList = (
    <>
      {variables.length > 0 ? (
        <div className="flex flex-col gap-3">
          {variables.map((variable) => {
            const isDuplicate = duplicateNames.has(variable.name.trim());
            const inputId = getVariableKey(variable.name);
            return (
              <div
                key={inputId}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                  <div className="sm:w-48">
                    <Label htmlFor={`${inputId}-name`} className="mb-1.5 block text-sm">
                      Variable Name
                    </Label>
                    <Input
                      id={`${inputId}-name`}
                      placeholder="e.g., user_id"
                      value={variable.name}
                      onChange={(e) => updateVariableName(variable.name, e.target.value)}
                      className={cn('font-mono', isDuplicate && 'border-destructive')}
                    />
                    {isDuplicate && <HelperText error>Duplicate variable name</HelperText>}
                  </div>
                  <div className="flex-1">
                    <Label htmlFor={`${inputId}-desc`} className="mb-1.5 block text-sm">
                      Instructions
                    </Label>
                    <Input
                      id={`${inputId}-desc`}
                      placeholder="e.g., A realistic user ID in UUID format"
                      value={variable.description}
                      onChange={(e) => updateVariableDescription(variable.name, e.target.value)}
                    />
                  </div>
                  <div className="sm:w-40">
                    <Label htmlFor={`${inputId}-type`} className="mb-1.5 block text-sm">
                      Variable Type
                    </Label>
                    <Select
                      value={variable.type}
                      onValueChange={(value) =>
                        updateVariableType(variable.name, value as InputType)
                      }
                    >
                      <SelectTrigger id={`${inputId}-type`}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {INPUT_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeVariable(variable.name)}
                  aria-label={`Delete variable ${variable.name}`}
                  className="mt-6 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
          {addVariableButton}
        </div>
      ) : (
        addVariableButton
      )}
    </>
  );

  if (compact) {
    return variablesList;
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-background p-4 hover:bg-muted/50">
        <div className="text-left">
          <h3 className="font-semibold">Multi-Variable Inputs</h3>
          <p className="text-sm text-muted-foreground">
            Define additional input variables for test case generation
            {variables.length > 0 && ` (${variables.length} configured)`}
          </p>
        </div>
        <ChevronDown className={cn('size-5 transition-transform', isExpanded && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-4">
        <div className="mb-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Configure additional variables that will be generated alongside adversarial prompts.
            Each variable needs a name and a description that tells the LLM what kind of value to
            generate.
          </p>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="mb-2 text-sm font-medium">How it works:</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>
                Variables are available as{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  {'{{variable_name}}'}
                </code>{' '}
                in your request body, headers, URL, and transforms
              </li>
              <li>
                The LLM generates contextual values based on your description (e.g., realistic user
                IDs, session tokens, roles)
              </li>
              <li>PDF, DOCX, and image variables are wrapped into real file payloads at runtime</li>
              <li>
                Values are generated fresh for each test case alongside the adversarial prompt
              </li>
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            See{' '}
            <a
              href="https://www.promptfoo.dev/docs/red-team/configuration/multi-input/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              documentation
            </a>{' '}
            for more details and examples.
          </p>
        </div>
        {variablesList}
      </CollapsibleContent>
    </Collapsible>
  );
}
