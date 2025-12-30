import React, { useEffect } from 'react';

import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';

interface VarsFormProps {
  onAdd: (vars: Record<string, string>) => void;
  varsList: string[];
  initialValues?: Record<string, string>;
}

const VarsForm = ({ onAdd, varsList, initialValues }: VarsFormProps) => {
  const [vars, setVars] = React.useState<Record<string, string>>(initialValues || {});

  useEffect(() => {
    const newVars: Record<string, string> = {};
    varsList.forEach((v) => {
      newVars[v] = initialValues?.[v] || '';
    });
    setVars(newVars);
  }, [varsList, initialValues]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Variables</h3>
      {varsList.length > 0 ? (
        <div className="space-y-3">
          {Object.keys(vars).map((varName) => (
            <div key={varName} className="grid grid-cols-[200px_1fr] gap-4 items-center">
              <Label htmlFor={`var-${varName}`} className="font-medium">
                {varName}
              </Label>
              <Input
                id={`var-${varName}`}
                placeholder={`Enter value for ${varName}`}
                value={vars[varName] || ''}
                onChange={(e) => {
                  const newValue = e.target.value;
                  const newVars = {
                    ...vars,
                    [varName]: newValue,
                  };
                  setVars(newVars);
                  onAdd(newVars);
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add variables to your prompt using the {'{{varname}}'} syntax.
        </p>
      )}
    </div>
  );
};

export default VarsForm;
