import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';

interface InputVariable {
  id: string;
  name: string;
  description: string;
  nameError?: string;
}

interface InputsEditorProps {
  inputs?: Record<string, string>;
  onChange: (inputs: Record<string, string> | undefined) => void;
  /** When true, renders without the outer collapsible wrapper */
  compact?: boolean;
  /** When true, disables adding new variables */
  disabled?: boolean;
  /** Tooltip text shown when disabled */
  disabledReason?: string;
}

export default function InputsEditor({
  inputs,
  onChange,
  compact = false,
  disabled = false,
  disabledReason,
}: InputsEditorProps) {
  const [variables, setVariables] = useState<InputVariable[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const isUpdatingFromProps = useRef(false);
  const idCounterRef = useRef(0);

  // Initialize local state from props
  useEffect(() => {
    if (!isUpdatingFromProps.current) {
      const inputEntries = inputs ? Object.entries(inputs) : [];
      if (inputEntries.length > 0) {
        const variableList = inputEntries.map(([name, description]) => ({
          id: `input-${Date.now()}-${idCounterRef.current++}`,
          name,
          description,
        }));
        setVariables(variableList);
        setIsExpanded(true);
      } else {
        setVariables([]);
      }
    }
    isUpdatingFromProps.current = false;
  }, [inputs]);

  // Sync local state back to parent
  const syncToParent = useCallback(() => {
    const validVariables = variables.filter((v) => v.name.trim() && !v.nameError);
    if (validVariables.length === 0) {
      onChange(undefined);
    } else {
      const inputsObj: Record<string, string> = {};
      validVariables.forEach((v) => {
        inputsObj[v.name.trim()] = v.description;
      });
      onChange(inputsObj);
    }
  }, [variables, onChange]);

  // Debounced sync to parent
  useEffect(() => {
    isUpdatingFromProps.current = true;
    const timeoutId = setTimeout(() => {
      syncToParent();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [syncToParent]);

  // Validate variable names for duplicates
  const validateVariableNames = useCallback((updatedVariables: InputVariable[]) => {
    const nameCount = new Map<string, number>();
    updatedVariables.forEach((variable) => {
      const trimmedName = variable.name.trim();
      if (trimmedName) {
        nameCount.set(trimmedName, (nameCount.get(trimmedName) || 0) + 1);
      }
    });

    return updatedVariables.map((variable) => {
      const trimmedName = variable.name.trim();
      const isDuplicate = trimmedName && nameCount.get(trimmedName)! > 1;
      return {
        ...variable,
        nameError: isDuplicate ? 'Duplicate variable name' : undefined,
      };
    });
  }, []);

  const addVariable = () => {
    const existingNames = variables.map((v) => v.name);
    let counter = 1;
    let newName = 'variable';
    while (existingNames.includes(newName)) {
      newName = `variable${counter}`;
      counter++;
    }

    const newVariable: InputVariable = {
      id: `input-${Date.now()}-${idCounterRef.current++}`,
      name: newName,
      description: '',
    };

    const updatedVariables = validateVariableNames([...variables, newVariable]);
    setVariables(updatedVariables);
    setIsExpanded(true);
  };

  const updateVariableName = (id: string, name: string) => {
    const updatedVariables = variables.map((variable) =>
      variable.id === id ? { ...variable, name } : variable,
    );
    const validatedVariables = validateVariableNames(updatedVariables);
    setVariables(validatedVariables);
  };

  const updateVariableDescription = (id: string, description: string) => {
    const updatedVariables = variables.map((variable) =>
      variable.id === id ? { ...variable, description } : variable,
    );
    setVariables(updatedVariables);
  };

  const removeVariable = (id: string) => {
    const updatedVariables = variables.filter((variable) => variable.id !== id);
    const validatedVariables = validateVariableNames(updatedVariables);
    setVariables(validatedVariables);
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
          {variables.map((variable) => (
            <div key={variable.id} className="flex items-start gap-3 rounded-lg border p-3">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <div className="sm:w-48">
                  <Label htmlFor={`${variable.id}-name`} className="mb-1.5 block text-sm">
                    Variable Name
                  </Label>
                  <Input
                    id={`${variable.id}-name`}
                    placeholder="e.g., user_id"
                    value={variable.name}
                    onChange={(e) => updateVariableName(variable.id, e.target.value)}
                    className={cn('font-mono', variable.nameError && 'border-destructive')}
                  />
                  {variable.nameError && (
                    <p className="mt-1 text-xs text-destructive">{variable.nameError}</p>
                  )}
                </div>
                <div className="flex-1">
                  <Label htmlFor={`${variable.id}-desc`} className="mb-1.5 block text-sm">
                    Description
                  </Label>
                  <Input
                    id={`${variable.id}-desc`}
                    placeholder="e.g., A realistic user ID in UUID format"
                    value={variable.description}
                    onChange={(e) => updateVariableDescription(variable.id, e.target.value)}
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeVariable(variable.id)}
                aria-label={`Delete variable ${variable.name}`}
                className="mt-6 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
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
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-background p-4 hover:bg-muted/50">
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
          <div className="rounded-md border bg-muted/30 p-3">
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
