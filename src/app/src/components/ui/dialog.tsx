import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-(--z-modal-backdrop) bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ref,
  hideDescription = true,
  hideCloseButton = false,
  'aria-describedby': ariaDescribedBy,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Adds a hidden fallback when no visible description is present. Defaults to true. */
  hideDescription?: boolean;
  /** Hides the default close button when a caller supplies its own. */
  hideCloseButton?: boolean;
}) {
  const [contentElement, setContentElement] = React.useState<HTMLDivElement | null>(null);
  const [descriptionIds, setDescriptionIds] = React.useState('');
  const contentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setContentElement(node);
      if (typeof ref === 'function') {
        const cleanup = ref(node);
        if (typeof cleanup === 'function') {
          return () => {
            setContentElement(null);
            cleanup();
          };
        }
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  React.useLayoutEffect(() => {
    if (!contentElement) {
      return;
    }
    const updateDescriptions = () => {
      const ids = new Set<string>();
      for (const node of contentElement.querySelectorAll<HTMLElement>(
        '[data-promptfoo-dialog-description]',
      )) {
        if (node.closest('[data-promptfoo-dialog-content]') !== contentElement) {
          continue;
        }
        // Slotted children can override the generated id with an unusable IDREF.
        if (!node.id || /\s/.test(node.id)) {
          node.id = node.dataset.promptfooDialogDescription!;
        }
        ids.add(node.id);
      }
      setDescriptionIds([...ids].join(' '));
    };
    updateDescriptions();
    const observer = new MutationObserver(updateDescriptions);
    observer.observe(contentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id', 'data-promptfoo-dialog-description'],
    });
    return () => observer.disconnect();
  }, [contentElement]);

  const showFallbackDescription =
    hideDescription && ariaDescribedBy === undefined && !descriptionIds;
  const descriptionProps = showFallbackDescription
    ? {}
    : { 'aria-describedby': ariaDescribedBy ?? (descriptionIds || undefined) };

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        {...descriptionProps}
        className={cn(
          'fixed left-[50%] top-[50%] z-(--z-modal) grid w-full max-w-lg max-h-[calc(100vh-4rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
          className,
        )}
        {...props}
        data-promptfoo-dialog-content=""
      >
        <DialogPrimitive.Description
          aria-hidden={showFallbackDescription ? undefined : true}
          className="sr-only"
        >
          {showFallbackDescription ? 'Dialog content' : ''}
        </DialogPrimitive.Description>
        {children}
        {!hideCloseButton && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground cursor-pointer">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
      {...props}
    />
  );
}
DialogHeader.displayName = 'DialogHeader';

function DialogFooter({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  );
}
DialogFooter.displayName = 'DialogFooter';

function DialogTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  id,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const generatedId = React.useId();

  return (
    <DialogPrimitive.Description
      id={id && !/\s/.test(id) ? id : generatedId}
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
      data-promptfoo-dialog-description={generatedId}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
