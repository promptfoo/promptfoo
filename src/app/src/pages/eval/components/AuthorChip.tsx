import { type KeyboardEvent, useEffect, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { Info, Mail, Pencil } from 'lucide-react';

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
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(author || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!author && currentUserEmail) {
      setEmail(currentUserEmail);
    }
  }, [author, currentUserEmail]);

  const handleOpen = () => {
    if (editable) {
      setEmail(author || currentUserEmail || '');
      setError(null);
      setOpen(true);
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSave = async () => {
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await onEditAuthor(email || '');
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <div
              role={editable ? 'button' : undefined}
              tabIndex={editable ? 0 : undefined}
              onClick={handleOpen}
              onKeyDown={(e) => e.key === 'Enter' && handleOpen()}
              className={cn(
                'flex items-center border border-border rounded px-2 py-1 min-h-[40px] hover:bg-muted transition-colors',
                editable ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              <Mail className="h-4 w-4 mr-2 opacity-70" />
              <span className="text-sm mr-2">
                <strong>Author:</strong> {author || 'Unknown'}
              </span>
              {editable && (
                <button
                  type="button"
                  className="ml-auto p-1 rounded hover:bg-muted transition-colors"
                  disabled={isLoading}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {editable ? (author ? 'Click to edit author' : 'Click to set author') : 'Author'}
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-[400px] p-4" align="start">
        <div className="flex flex-col">
          <div className="flex items-end gap-4 mb-4">
            <div className="flex-1 space-y-1">
              <label htmlFor="author-email" className="text-sm font-medium">
                Author Email
              </label>
              <Input
                id="author-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isLoading}
                className={cn(error && 'border-destructive')}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <Button onClick={handleSave} disabled={isLoading || !email}>
              {isLoading ? <Spinner size="sm" /> : 'Save'}
            </Button>
          </div>
          {!currentUserEmail && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="h-4 w-4 text-blue-500" />
              <p className="text-xs">
                {`Setting an email address will also set the default author for future evals.
                It is changeable with \`promptfoo config set email <your-email@example.com>\``}
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
