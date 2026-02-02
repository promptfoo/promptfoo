import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

interface Variable {
  id: string;
  name: string;
  value: string;
  nameError?: string;
}

export default function DefaultTestVariables() {
  const { config, updateConfig } = useRedTeamConfig();

  // Local state for the form
  const [variables, setVariables] = useState<Variable[]>([]);
  const isUpdatingFromLocal = useRef(false);
  const idCounterRef = useRef(0);

  // Initialize local state from global config, but not when we're the source of the change
  useEffect(() => {
    if (!isUpdatingFromLocal.current) {
      const configVars = config.defaultTest?.vars || {};
      const variableList = Object.entries(configVars).map(([name, value]) => {
        const id = `var-${Date.now()}-${idCounterRef.current++}`;
        return {
          id,
          name,
          value: String(value),
        };
      });
      setVariables(variableList);
    }
    isUpdatingFromLocal.current = false;
  }, [config.defaultTest?.vars]);

  // Sync local state back to global config
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const syncToGlobalState = useCallback(() => {
    const vars: Record<string, string> = {};
    variables.forEach((variable) => {
      if (variable.name.trim() && !variable.nameError) {
        vars[variable.name.trim()] = variable.value;
      }
    });
    isUpdatingFromLocal.current = true; // Mark that we're updating from local state
    updateConfig('defaultTest', { ...config.defaultTest, vars });
  }, [variables, updateConfig]);

  // Validate variable names for duplicates
  const validateVariableNames = useCallback((updatedVariables: Variable[]) => {
    const nameCount = new Map<string, number>();

    // Count occurrences of each name
    updatedVariables.forEach((variable) => {
      const trimmedName = variable.name.trim();
      if (trimmedName) {
        nameCount.set(trimmedName, (nameCount.get(trimmedName) || 0) + 1);
      }
    });

    // Mark duplicates with errors
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
    const newVariable: Variable = {
      id: `var-${Date.now()}-${idCounterRef.current++}`,
      name: 'newVar',
      value: '',
    };

    // Generate unique name
    const existingNames = variables.map((v) => v.name);
    let counter = 1;
    let newName = 'newVar';
    while (existingNames.includes(newName)) {
      newName = `newVar${counter}`;
      counter++;
    }
    newVariable.name = newName;

    const updatedVariables = validateVariableNames([...variables, newVariable]);
    setVariables(updatedVariables);
  };

  const updateVariableName = (id: string, name: string) => {
    const updatedVariables = variables.map((variable) =>
      variable.id === id ? { ...variable, name } : variable,
    );
    const validatedVariables = validateVariableNames(updatedVariables);
    setVariables(validatedVariables);
  };

  const updateVariableValue = (id: string, value: string) => {
    const updatedVariables = variables.map((variable) =>
      variable.id === id ? { ...variable, value } : variable,
    );
    setVariables(updatedVariables);
  };

  const removeVariable = (id: string) => {
    const updatedVariables = variables.filter((variable) => variable.id !== id);
    const validatedVariables = validateVariableNames(updatedVariables);
    setVariables(validatedVariables);
  };

  // Sync to global state when variables change (debounced effect)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      syncToGlobalState();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [syncToGlobalState]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div className="mr-4 flex-1">
          <h3 className="mb-1 font-medium">Test Variables</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Set default variables that will be available across all test cases. Useful for
            parameterizing endpoints, API keys, language codes, etc.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addVariable} className="shrink-0">
          <Plus className="mr-2 size-4" />
          Add Variable
        </Button>
      </div>

      {variables.length > 0 ? (
        <div className="flex flex-col gap-4">
          {variables.map((variable) => (
            <div key={variable.id} className="flex items-start gap-3">
              <div className="min-w-[200px]">
                <Label className="sr-only">Variable name</Label>
                <Input
                  placeholder="Variable name"
                  value={variable.name}
                  onChange={(e) => updateVariableName(variable.id, e.target.value)}
                  className={variable.nameError ? 'border-destructive' : ''}
                />
                {variable.nameError && <HelperText error>{variable.nameError}</HelperText>}
              </div>
              <div className="grow">
                <Label className="sr-only">Value</Label>
                <Input
                  placeholder="Value"
                  value={variable.value}
                  onChange={(e) => updateVariableValue(variable.id, e.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeVariable(variable.id)}
                aria-label={`Delete variable ${variable.name}`}
                className="mt-0.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed px-6 py-8 text-center">
          <p className="mb-1 text-sm text-muted-foreground">No test variables configured</p>
          <p className="text-xs text-muted-foreground">Click "Add Variable" to get started</p>
        </div>
      )}
    </div>
  );
}
