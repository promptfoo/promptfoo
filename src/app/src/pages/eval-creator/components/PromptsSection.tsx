import React, { useEffect, useRef, useState } from 'react';

import { Alert, AlertContent, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { ContentCopyIcon, DeleteIcon, EditIcon, UploadIcon } from '@app/components/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import { useStore } from '@app/stores/evalConfig';
import PromptDialog from './PromptDialog';

interface PromptsSectionProps {
  onOpenYamlEditor?: () => void;
}

const getManagedPromptsLabel = (prompts: unknown): string => {
  if (typeof prompts === 'string') {
    return prompts;
  }

  if (Array.isArray(prompts)) {
    return `${prompts.length} YAML prompt entr${prompts.length === 1 ? 'y' : 'ies'}`;
  }

  return 'YAML prompt map';
};

const PromptsSection = ({ onOpenYamlEditor }: PromptsSectionProps) => {
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState<number | null>(null);

  const { config, updateConfig } = useStore();
  const { showToast } = useToast();
  const rawPrompts = config.prompts;
  const canEditInlinePrompts =
    rawPrompts === undefined ||
    (Array.isArray(rawPrompts) && rawPrompts.every((prompt) => typeof prompt === 'string'));
  const prompts = canEditInlinePrompts ? ((rawPrompts || []) as string[]) : [];
  const setPrompts = (p: string[]) => updateConfig({ prompts: p });
  const newPromptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingPromptIndex !== null && editingPromptIndex > 0 && newPromptInputRef.current) {
      newPromptInputRef.current.focus();
    }
  }, [editingPromptIndex]);

  const handleEditPrompt = (index: number) => {
    setEditingPromptIndex(index);
    setPromptDialogOpen(true);
  };

  const handleAddPromptFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    event.preventDefault();

    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result?.toString();
        if (!text || text.trim() === '') {
          showToast('The file appears to be empty. Please select a file with content.', 'error');
          event.target.value = '';
          return;
        }

        setPrompts([...prompts, text]);
        showToast('Prompt imported successfully', 'success');
        event.target.value = '';
      };
      reader.onerror = () => {
        showToast('Failed to read file', 'error');
        event.target.value = '';
      };
      reader.readAsText(file);
    }
  };

  const handleDuplicatePrompt = (event: React.MouseEvent, index: number) => {
    event.stopPropagation();
    const duplicatedPrompt = prompts[index];
    setPrompts([...prompts, duplicatedPrompt]);
  };

  const handleChangePrompt = (index: number, newPrompt: string) => {
    setPrompts(prompts.map((p, i) => (i === index ? newPrompt : p)));
  };

  const handleRemovePrompt = (event: React.MouseEvent, indexToRemove: number) => {
    event.stopPropagation();
    setPromptToDelete(indexToRemove);
    setDeleteDialogOpen(true);
  };

  const confirmDeletePrompt = () => {
    if (promptToDelete !== null) {
      setPrompts(prompts.filter((_, index) => index !== promptToDelete));
      setPromptToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const cancelDeletePrompt = () => {
    setPromptToDelete(null);
    setDeleteDialogOpen(false);
  };

  // Highlight template variables in prompt text
  const highlightVars = (text: string) => {
    const truncated = text.length > 250 ? text.slice(0, 250) + ' ...' : text;
    return truncated.split(/({{\w+}})/g).map((part: string, i: number) =>
      /{{\s*(\w+)\s*}}/g.test(part) ? (
        <span
          key={i}
          className="rounded border border-primary/20 bg-primary/10 px-1 py-0.5 font-mono text-xs text-foreground"
        >
          {part}
        </span>
      ) : (
        part
      ),
    );
  };

  return (
    <div className="space-y-4">
      {!canEditInlinePrompts && (
        <Alert variant="info" className="flex-col items-start sm:flex-row sm:items-center">
          <AlertContent>
            <AlertTitle>Managed in YAML</AlertTitle>
            <AlertDescription>
              This prompt configuration is loaded from{' '}
              <code className="rounded bg-background/80 px-1 py-0.5 text-xs">
                {getManagedPromptsLabel(rawPrompts)}
              </code>
              . Use the YAML editor to update it.
            </AlertDescription>
          </AlertContent>
          {onOpenYamlEditor && (
            <Button variant="outline" size="sm" onClick={onOpenYamlEditor}>
              Edit YAML
            </Button>
          )}
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-semibold">Prompts</h3>
        <div className="flex flex-wrap items-center gap-2">
          {canEditInlinePrompts && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="cursor-pointer" aria-label="Upload prompt from file">
                    <Button variant="ghost" size="icon" asChild>
                      <span>
                        <UploadIcon className="size-4" />
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept=".txt,.md"
                      onChange={handleAddPromptFromFile}
                      className="hidden"
                      aria-label="Upload prompt from file"
                    />
                  </label>
                </TooltipTrigger>
                <TooltipContent>Upload prompt from file</TooltipContent>
              </Tooltip>

              <Button
                onClick={() => setPromptDialogOpen(true)}
                className="dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Add Prompt
              </Button>

              {prompts.length === 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const examplePrompt =
                      'Write a short, fun story about a {{animal}} going on an adventure in {{location}}. Make it entertaining and suitable for children.';
                    setPrompts([...prompts, examplePrompt]);
                  }}
                >
                  Add Example
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Prompts List */}
      <div className="rounded-lg border border-border overflow-hidden">
        {canEditInlinePrompts ? (
          prompts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No prompts added yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {prompts.map((prompt, index) => (
                <div
                  key={index}
                  onClick={() => handleEditPrompt(index)}
                  className={cn(
                    'flex cursor-pointer flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between',
                    'hover:bg-muted/50 transition-colors',
                  )}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleEditPrompt(index);
                    }}
                    aria-label={`Open prompt ${index + 1} for editing`}
                    className="flex-1 rounded-sm text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:mr-4"
                  >
                    <span className="text-muted-foreground font-medium">Prompt #{index + 1}: </span>
                    {highlightVars(prompt)}
                  </button>
                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditPrompt(index);
                          }}
                          aria-label={`Edit prompt ${index + 1}`}
                        >
                          <EditIcon className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(event) => handleDuplicatePrompt(event, index)}
                          aria-label={`Duplicate prompt ${index + 1}`}
                        >
                          <ContentCopyIcon className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Duplicate</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(event) => handleRemovePrompt(event, index)}
                          aria-label={`Delete prompt ${index + 1}`}
                        >
                          <DeleteIcon className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            Prompt entries from YAML are not editable in the UI editor.
          </div>
        )}
      </div>

      {/* Prompt Dialog */}
      {canEditInlinePrompts && (
        <PromptDialog
          open={promptDialogOpen}
          prompt={editingPromptIndex === null ? '' : prompts[editingPromptIndex]}
          index={editingPromptIndex === null ? 0 : editingPromptIndex}
          isEditing={editingPromptIndex !== null}
          onAdd={(newPrompt) => {
            if (editingPromptIndex === null) {
              setPrompts([...prompts, newPrompt]);
            } else {
              handleChangePrompt(editingPromptIndex, newPrompt);
            }
            setEditingPromptIndex(null);
          }}
          onCancel={() => {
            setEditingPromptIndex(null);
            setPromptDialogOpen(false);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !open && cancelDeletePrompt()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete prompt?</DialogTitle>
            <DialogDescription>
              This removes the prompt from this evaluation. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDeletePrompt}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeletePrompt}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PromptsSection;
