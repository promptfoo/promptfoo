import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { Chip } from '@app/components/ui/chip';
import { Input } from '@app/components/ui/input';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useToast } from '@app/hooks/useToast';
import { Check, Pencil, X } from 'lucide-react';

interface AuthorChipProps {
  author: string | null;
  onEditAuthor: (newAuthor: string) => Promise<void>;
  currentUserEmail: string | null;
  editable: boolean;
}

export const AuthorChip = ({
  author,
  onEditAuthor,
  currentUserEmail,
  editable,
}: AuthorChipProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState(author || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (editable) {
      setEmail(author || currentUserEmail || '');
      setIsEditing(true);
    }
  };

  const handleCancel = () => {
    setEmail(author || '');
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      await onEditAuthor(email || '');
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      showToast(message, 'error');
      setEmail(author || '');
      setIsEditing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSave();
    } else if (event.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center h-8 border border-input rounded-md bg-white dark:bg-zinc-900 overflow-hidden">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pl-3 shrink-0">
          AUTHOR
        </span>
        <Input
          ref={inputRef}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="h-auto py-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-xs min-w-[150px]"
          placeholder="email@example.com"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isLoading}
          className="p-1.5 hover:bg-muted/50 transition-colors text-emerald-600 dark:text-emerald-400"
          aria-label="Save"
        >
          {isLoading ? <Spinner className="size-3.5" /> : <Check className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isLoading}
          className="p-1.5 pr-2 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-destructive"
          aria-label="Cancel"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Chip
          label="AUTHOR"
          onClick={handleStartEdit}
          disabled={!editable}
          interactive={editable}
          trailingIcon={
            editable ? <Pencil className="size-3.5 text-muted-foreground" /> : undefined
          }
        >
          {author || 'Unknown'}
        </Chip>
      </TooltipTrigger>
      <TooltipContent>
        {editable ? (author ? 'Click to edit author' : 'Click to set author') : 'Author'}
      </TooltipContent>
    </Tooltip>
  );
};
