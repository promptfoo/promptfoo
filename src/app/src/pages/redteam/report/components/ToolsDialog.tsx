import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';

export interface Tool {
  type: string;
  function?: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

interface ToolsDialogProps {
  open: boolean;
  onClose: () => void;
  tools: Tool[];
}

const ToolsDialog = ({ open, onClose, tools }: ToolsDialogProps) => {
  if (!tools || tools.length === 0) {
    return null;
  }
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Available Tools</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <ul className="space-y-4">
            {tools.map((tool, index) => (
              <li
                key={tool.function?.name ?? index}
                className="border-b border-border pb-4 last:border-0"
              >
                {tool?.type === 'function' && tool.function ? (
                  <div>
                    <h4 className="font-medium text-foreground">{tool.function.name}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tool.function.description}
                    </p>
                    <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                      {JSON.stringify(tool.function.parameters, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-medium text-foreground">Unknown Tool Type</h4>
                    <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                      {JSON.stringify(tool, null, 2)}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ToolsDialog;
