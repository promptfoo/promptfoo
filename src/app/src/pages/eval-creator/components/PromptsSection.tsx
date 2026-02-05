import React, { useEffect, useRef, useState } from 'react';

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
import { cn } from '@app/lib/utils';
import { useStore } from '@app/stores/evalConfig';
import PromptDialog from './PromptDialog';

const PromptsSection = () => {
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState<number | null>(null);

  const { config, updateConfig } = useStore();
  const prompts = (config.prompts || []) as string[];
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
        if (text) {
          setPrompts([...prompts, text]);
        }
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
        <span key={i} className="bg-primary/20 text-primary px-1 py-0.5 rounded font-mono text-xs">
          {part}
        </span>
      ) : (
        part
      ),
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Prompts</h2>
        <div className="flex items-center gap-2">
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
          <Button onClick={() => setPromptDialogOpen(true)}>Add Prompt</Button>
        </div>
      </div>

      {/* Prompts List */}
      <div className="rounded-lg border border-border overflow-hidden">
        {prompts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No prompts added yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {prompts.map((prompt, index) => (
              <div
                key={index}
                onClick={() => handleEditPrompt(index)}
                className={cn(
                  'flex items-center justify-between p-4 cursor-pointer',
                  'hover:bg-muted/50 transition-colors',
                )}
              >
                <p className="text-sm flex-1 mr-4">
                  <span className="text-muted-foreground font-medium">Prompt #{index + 1}: </span>
                  {highlightVars(prompt)}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditPrompt(index);
                        }}
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
        )}
      </div>

      {/* Prompt Dialog */}
      <PromptDialog
        open={promptDialogOpen}
        prompt={editingPromptIndex === null ? '' : prompts[editingPromptIndex]}
        index={editingPromptIndex === null ? 0 : editingPromptIndex}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !open && cancelDeletePrompt()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Prompt</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this prompt? This action cannot be undone.
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
