import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { type Inputs, normalizeInputDefinition } from '@promptfoo/types';

interface VariableSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variables: string[];
  variableDescriptions?: Inputs;
  selectedVariable: string;
  onSelectedVariableChange: (variable: string) => void;
  onConfirm: () => void;
}

function getVariableDescription(variableDescriptions: Inputs | undefined, variableName: string) {
  const variableDescription = variableDescriptions?.[variableName];
  return variableDescription
    ? normalizeInputDefinition(variableDescription).description
    : undefined;
}

export default function VariableSelectionDialog({
  open,
  onOpenChange,
  variables,
  variableDescriptions,
  selectedVariable,
  onSelectedVariableChange,
  onConfirm,
}: VariableSelectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Main Input Variable</DialogTitle>
          <DialogDescription>
            Your configuration has multiple input variables. Select which variable should be used
            for the conversational session test. The test will send two messages using this variable
            to verify session persistence.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="main-variable" className="mb-2 block text-sm font-medium">
            Main Input Variable
          </Label>
          <Select value={selectedVariable} onValueChange={onSelectedVariableChange}>
            <SelectTrigger id="main-variable">
              <SelectValue placeholder="Select a variable" />
            </SelectTrigger>
            <SelectContent>
              {variables.map((varName) => {
                const description = getVariableDescription(variableDescriptions, varName);

                return (
                  <SelectItem key={varName} value={varName}>
                    <span className="font-mono">{`{{${varName}}}`}</span>
                    {description && (
                      <span className="ml-2 text-muted-foreground">- {description}</span>
                    )}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            Other variables will use test values (e.g., test_user_id, test_session_token).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!selectedVariable}>
            Run Test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
